// WebRTC voice/video client for `^` voice channels.
//
// Signaling rides over IRC TAGMSGs with the +obsidianirc/rtc tag,
// brokered by obbyircd's voice-channels module to the hosted-backend
// SFU.  We never peer with other users directly -- every track flows
// through the SFU and is ICE/DTLS-SRTP encrypted end-to-end with the
// SFU.
//
// Lifecycle:
//   1. join(serverId, channel)
//      -> JOIN ^channel (so we appear in NAMES)
//      -> TAGMSG ^channel @+obsidianirc/rtc={"type":"join",…}
//   2. SFU replies with {"type":"joined", members, turn}
//      -> we build an RTCPeerConnection with the supplied TURN creds
//      -> getUserMedia + addTrack
//      -> createOffer + send via TAGMSG
//   3. SFU answers with {"type":"answer", sdp}
//      -> setRemoteDescription
//   4. ICE candidates flow both ways via {"type":"ice"} TAGMSGs
//   5. Other peers' tracks arrive via OnTrack
//
// All public surface is the VoiceClient class -- one instance per
// (serverId,channel) join.  The hook in voice/store.ts manages the
// active instance and exposes state to React.

import ircClient from "./ircClient";

export interface VoiceMember {
  nick: string;
  micOn: boolean;
  videoOn: boolean;
  speaking: boolean;
  deafened: boolean;
  screenSharing: boolean;
  // Hand-raise: separate transient flag, propagated via presence
  // like mic/video. Lowered automatically on leave or after the user
  // toggles it off.
  handRaised: boolean;
  // Local-only per-peer volume (0..1). Affects this client's audio
  // sink only; doesn't travel across the wire. 0 == ignore audio.
  volume: number;
  // Local-only connection-quality summary derived from RTCPeerConnection
  // getStats() ticks. "good" / "ok" / "poor" / "unknown".
  quality: "good" | "ok" | "poor" | "unknown";
  // Latest inbound MediaStreamTracks we've received from the SFU,
  // keyed by kind.  An audio element / video element will pick them
  // up via the onTrack subscription below.
  audioTrack?: MediaStreamTrack;
  videoTrack?: MediaStreamTrack;
}

export type VoiceState =
  | { phase: "idle" }
  | { phase: "joining" }
  | { phase: "connected"; members: Record<string, VoiceMember> }
  | { phase: "failed"; error: string };

interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface SignalEnvelope {
  type:
    | "join"
    | "leave"
    | "joined"
    | "offer"
    | "answer"
    | "ice"
    | "presence"
    | "error"
    | "mic"
    | "video"
    | "speaking"
    | "silent"
    | "deaf"
    | "screen"
    | "hand"
    | "react";
  channel?: string;
  sdp?: string;
  cand?: string;
  mid?: string;
  mlineidx?: number;
  state?: string;
  kind?: string; // which sub-state (mic|video|screen|hand) when type=presence
  emoji?: string; // floating reaction
  members?: string[];
  member?: string;
  turn?: { urls: string[]; username: string; password: string };
  error?: string;

  // SDP chunking (offer / answer only). The server's CLIENT_TAG_SIZE_LIMIT
  // is 8191 bytes post-IRCv3-escape; a video offer/answer routinely blows
  // past that. sendSignal() splits oversized SDPs into N pieces sharing
  // an "id" with sequential "seq"/"total"; the SFU reassembles before
  // dispatching.
  id?: string;
  seq?: number;
  total?: number;

  // Track-to-nick attribution hint sent alongside any envelope that
  // carries SDP (joined / offer / answer). Pion's emitted SDP doesn't
  // always include a=msid for tracks added mid-session, and Firefox
  // falls back to a browser-generated "{uuid}" stream id in that case
  // so we can't resolve which member a track belongs to from the
  // browser-visible stream/track ids alone.
  tracks?: TrackHint[];
}

interface TrackHint {
  track_id: string;
  mid?: string;
  member: string;
  kind: string;
}

const RTC_TAG = "+obsidianirc/rtc";

// Mirrors UnrealIRCd's `message_tag_escape` (src/modules/message-tags.c)
// byte-for-byte, which is the canonical IRCv3 message-tag value escape
// table. Single-pass char loop -- avoids chained .replace() ordering
// hazards on payloads that contain escape sequences themselves (e.g.
// SDP carrying "a=fingerprint:..." which has both ';' separators and
// spaces).
function escapeIrcTagValue(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x3b /* ; */: out += "\\:"; break;
      case 0x20 /* space */: out += "\\s"; break;
      case 0x5c /* \ */: out += "\\\\"; break;
      case 0x0d /* CR */: out += "\\r"; break;
      case 0x0a /* LF */: out += "\\n"; break;
      default: out += s[i];
    }
  }
  return out;
}

// IRCv3 tag-value escaping is reversed by the parser before we see
// it -- ircClient already decodes message tag values, so the tag
// value handed to us is the raw JSON.

export interface VoiceClientOptions {
  serverId: string;
  channel: string;
  selfNick: string;
  onState: (s: VoiceState) => void;
  onError: (e: string) => void;
  /** Fired when a peer (or the local user, echo) sends an emoji
   *  reaction. The view animates the emoji floating up over that
   *  member's tile. */
  onReaction?: (nick: string, emoji: string) => void;
  /** Audio element created by the React layer, used as the sink for
   *  inbound audio tracks.  Created upfront because Safari requires
   *  an attached element for autoplay to kick in. */
  audioSink: HTMLAudioElement;
}

export class VoiceClient {
  private opts: VoiceClientOptions;
  private pc?: RTCPeerConnection;
  private localStream?: MediaStream;
  private screenStream?: MediaStream;
  private members: Record<string, VoiceMember> = {};
  // Map of track-id (as set by the SFU) -> member nick. Populated
  // from any SDP-carrying envelope's `tracks` hint. Used as the
  // primary lookup in attachInboundTrack so we don't depend on the
  // browser's flaky msid handling.
  private trackOwners: Record<string, string> = {};
  // Same map as trackOwners but keyed by transceiver mid -- the only
  // identifier Firefox reliably preserves for tracks added
  // mid-session.
  private midOwners: Record<string, string> = {};
  // ICE candidates that arrived before the first remoteDescription
  // was set. Drained by drainPendingIce() after every successful
  // setRemoteDescription.
  private pendingIce: RTCIceCandidateInit[] = [];
  // Push-to-talk mode flag.
  private pttMode = false;
  // Per-peer local mute set: nicks whose inbound audio is silenced
  // by toggling the MediaStreamTrack.enabled flag (silences only on
  // this client; the SFU continues to relay the track to others).
  private localMutes = new Set<string>();
  // Connection-quality poll handle.
  private statsTimer?: ReturnType<typeof setInterval>;
  private state: VoiceState = { phase: "idle" };
  private tagmsgUnsub?: () => void;
  private speakingTimer?: ReturnType<typeof setInterval>;
  private vadAudioCtx?: AudioContext;
  private isSpeakingNow = false;

  constructor(opts: VoiceClientOptions) {
    this.opts = opts;
  }

  /** Re-bind the view-side callbacks without tearing the call down.
   *  Used when the React component re-mounts after the user navigated
   *  away and back. Audio sink is owned by voice.ts itself (a hidden
   *  document-level <audio>), so the view doesn't need to pass one. */
  attach(callbacks: {
    onState: (s: VoiceState) => void;
    onError: (e: string) => void;
    onReaction?: (nick: string, emoji: string) => void;
  }): void {
    this.opts = { ...this.opts, ...callbacks };
    // Push current state immediately so the freshly mounted UI doesn't
    // flash "idle" before the next state transition.
    callbacks.onState(this.state);
  }

  getState(): VoiceState {
    return this.state;
  }

  async join(): Promise<void> {
    if (this.state.phase !== "idle") return;
    this.setState({ phase: "joining" });

    // Subscribe to inbound TAGMSGs carrying our tag.
    const handler = (p: {
      serverId: string;
      sender: string;
      channelName: string;
      mtags?: Record<string, string>;
    }) => {
      if (p.serverId !== this.opts.serverId) return;
      if (!p.mtags) return;
      const raw = p.mtags[RTC_TAG];
      if (!raw) return;
      try {
        const env = JSON.parse(raw) as SignalEnvelope;
        this.onSignal(p.sender, p.channelName, env);
      } catch (err) {
        console.warn("voice: bad RTC payload", err);
      }
    };
    ircClient.on("TAGMSG", handler);
    this.tagmsgUnsub = () => ircClient.deleteHook("TAGMSG", handler);

    // Step 1: appear in the IRC channel.
    ircClient.sendRaw(this.opts.serverId, `JOIN ${this.opts.channel}`);

    // Step 2: signal join to the SFU.
    this.sendSignal({ type: "join", channel: this.opts.channel });
  }

  leave(): void {
    // Even if state is already "idle" we may still have a TAGMSG
    // handler subscribed (e.g. error path called teardown but the
    // owning React effect hadn't unmounted yet, or join was racy).
    // Always run teardown so the unsub fires; only emit leave / PART
    // when there's actually an active session to tear down.
    if (this.state.phase !== "idle") {
      this.sendSignal({ type: "leave", channel: this.opts.channel });
      ircClient.sendRaw(this.opts.serverId, `PART ${this.opts.channel}`);
    }
    this.teardown();
  }

  setDeafened(on: boolean): void {
    if (this.opts.audioSink) this.opts.audioSink.muted = on;
  }

  /** Send a transient emoji reaction visible to everyone in the room.
   *  The server's handleReaction echoes the broadcast back to the
   *  sender too, so we don't manually emit the local copy here -- the
   *  inbound onSignal "react" path renders it for everyone uniformly. */
  sendReaction(emoji: string): void {
    this.sendSignal({ type: "react", emoji });
  }

  /** Toggle the local hand-raised state and tell the rest of the room. */
  setHandRaised(on: boolean): void {
    const selfNick = this.opts.selfNick;
    const m = this.members[selfNick] ?? blankMember(selfNick);
    m.handRaised = on;
    this.members[selfNick] = m;
    this.sendSignal({ type: "hand", state: on ? "on" : "off" });
    this.setState({ phase: "connected", members: { ...this.members } });
  }

  /** Locally mute / unmute a specific peer. Toggles the inbound
   *  audio track's `enabled` flag, which silences playback on this
   *  client without affecting the SFU's relay to other peers. */
  setMemberMuted(nick: string, muted: boolean): void {
    const m = this.members[nick];
    if (!m) return;
    if (muted) this.localMutes.add(nick);
    else this.localMutes.delete(nick);
    m.volume = muted ? 0 : 1;
    if (m.audioTrack) m.audioTrack.enabled = !muted;
    this.setState({ phase: "connected", members: { ...this.members } });
  }

  /** Push-to-talk: when enabled the mic stays muted by default and
   *  callers can briefly unmute via setMicTransient(true). When
   *  disabled, mic returns to its normal toggled state. */
  setPushToTalk(on: boolean): void {
    this.pttMode = on;
    if (on) this.setMic(false);
  }

  setMic(on: boolean): void {
    if (!this.localStream) return;
    for (const t of this.localStream.getAudioTracks()) t.enabled = on;
    this.sendSignal({ type: "mic", state: on ? "on" : "off" });
  }

  async setVideo(on: boolean): Promise<void> {
    if (!this.pc || !this.localStream) return;
    const selfNick = this.opts.selfNick;
    const selfMember = this.members[selfNick] ?? blankMember(selfNick);
    if (on) {
      try {
        const video = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const track = video.getVideoTracks()[0];
        this.localStream.addTrack(track);
        this.pc.addTrack(track, this.localStream);
        selfMember.videoTrack = track;
        selfMember.videoOn = true;
        this.members[selfNick] = selfMember;
        await this.renegotiate();
      } catch (err) {
        this.opts.onError(`camera: ${err}`);
        return;
      }
    } else {
      for (const t of this.localStream.getVideoTracks()) {
        t.stop();
        this.localStream.removeTrack(t);
      }
      selfMember.videoTrack = undefined;
      selfMember.videoOn = false;
      this.members[selfNick] = selfMember;
      // Renegotiate so the SFU drops the video.
      await this.renegotiate();
    }
    this.sendSignal({ type: "video", state: on ? "on" : "off" });
    this.setState({
      phase: "connected",
      members: { ...this.members },
    });
  }

  async setScreenShare(on: boolean): Promise<void> {
    if (!this.pc) return;
    const selfNick = this.opts.selfNick;
    const selfMember = this.members[selfNick] ?? blankMember(selfNick);
    if (on) {
      let screen: MediaStream;
      try {
        screen = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
      } catch (err) {
        this.opts.onError(`screen: ${err}`);
        return;
      }
      // Re-check pc *after* the await: the screen-picker dialog can
      // sit open for many seconds, during which the call may have
      // been torn down (hangup) or never even existed (race with a
      // failed onJoined). Without this guard we throw "addTrack of
      // undefined" and leak the captured stream.
      if (!this.pc) {
        for (const t of screen.getTracks()) t.stop();
        return;
      }
      this.screenStream = screen;
      const track = screen.getVideoTracks()[0];
      try {
        this.pc.addTrack(track, screen);
      } catch (err) {
        for (const t of screen.getTracks()) t.stop();
        this.screenStream = undefined;
        this.opts.onError(`screen: ${err}`);
        return;
      }
      track.onended = () => this.setScreenShare(false);
      // Local self preview: piggy-back onto videoTrack so the
      // existing tile renderer shows what we're sharing. videoOn
      // already covers camera vs. nothing; screenSharing
      // distinguishes the two states for the UI.
      selfMember.videoTrack = track;
      selfMember.screenSharing = true;
      this.members[selfNick] = selfMember;
      await this.renegotiate();
    } else if (this.screenStream) {
      for (const t of this.screenStream.getTracks()) t.stop();
      this.screenStream = undefined;
      // Only clear self.videoTrack if the camera isn't also on.
      if (!this.localStream?.getVideoTracks().length) {
        selfMember.videoTrack = undefined;
      }
      selfMember.screenSharing = false;
      this.members[selfNick] = selfMember;
      await this.renegotiate();
    }
    this.sendSignal({ type: "screen", state: on ? "on" : "off" });
    this.setState({
      phase: "connected",
      members: { ...this.members },
    });
  }

  /* ------- signaling ------- */

  // Raw SDP threshold above which we split across multiple TAGMSGs.
  // Each split slice ends up ~2x size after IRCv3 escape (every space
  // and newline doubles), so 3000 raw → ~6 KB on the wire, comfortably
  // under the server's 8191-byte CLIENT_TAG_SIZE_LIMIT once you add
  // wrapper JSON + the rest of the IRC line.
  private static SDP_CHUNK_RAW_LIMIT = 3000;

  private sendSignal(env: SignalEnvelope) {
    if (
      (env.type === "offer" || env.type === "answer") &&
      env.sdp &&
      env.sdp.length > VoiceClient.SDP_CHUNK_RAW_LIMIT
    ) {
      this.sendChunkedSignal(env);
      return;
    }
    this.emitSignal(env);
  }

  private emitSignal(env: SignalEnvelope) {
    const json = JSON.stringify(env);
    const escaped = escapeIrcTagValue(json);
    ircClient.sendRaw(
      this.opts.serverId,
      `@${RTC_TAG}=${escaped} TAGMSG ${this.opts.channel}`,
    );
  }

  private sendChunkedSignal(env: SignalEnvelope) {
    const sdp = env.sdp ?? "";
    const limit = VoiceClient.SDP_CHUNK_RAW_LIMIT;
    const total = Math.ceil(sdp.length / limit);
    const id = randomChunkId();
    for (let seq = 0; seq < total; seq++) {
      const chunk: SignalEnvelope = {
        ...env,
        sdp: sdp.slice(seq * limit, (seq + 1) * limit),
        id,
        seq,
        total,
      };
      this.emitSignal(chunk);
    }
  }

  private async onSignal(sender: string, _target: string, env: SignalEnvelope) {
    // Any SDP-carrying envelope can ship a tracks-hint map. Merge it
    // into trackOwners so attachInboundTrack can resolve incoming
    // remote tracks to the right member without relying on browser
    // msid behavior.
    if (env.tracks) {
      for (const h of env.tracks) {
        this.trackOwners[h.track_id] = h.member;
        if (h.mid) this.midOwners[h.mid] = h.member;
      }
    }
    switch (env.type) {
      case "joined":
        await this.onJoined(env);
        break;
      case "answer":
        if (env.sdp && this.pc) {
          await this.pc.setRemoteDescription({
            type: "answer",
            sdp: env.sdp,
          });
          await this.drainPendingIce();
        }
        break;
      case "offer":
        // Server-initiated renegotiation: SFU pushes an offer when it
        // adds a new remote sender to our PC (e.g. another peer turned
        // on video / screen share). We always answer; the client never
        // initiates an SFU-bound offer except via this.renegotiate().
        if (env.sdp && this.pc) {
          try {
            await this.pc.setRemoteDescription({
              type: "offer",
              sdp: env.sdp,
            });
            await this.drainPendingIce();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.sendSignal({ type: "answer", sdp: answer.sdp ?? "" });
          } catch (err) {
            console.warn("voice: server-pushed offer failed", err);
          }
        }
        break;
      case "ice":
        if (env.cand && this.pc) {
          // Buffer ICE that arrives before the first remoteDescription
          // is set (otherwise pion's eager candidate emit + IRC's
          // arbitrary delivery order can race ahead of the answer/
          // offer SDP and trip "DOMException: No remoteDescription").
          if (!this.pc.remoteDescription) {
            this.pendingIce.push({
              candidate: env.cand,
              sdpMid: env.mid ?? null,
              sdpMLineIndex: env.mlineidx ?? null,
            });
          } else {
            try {
              await this.pc.addIceCandidate({
                candidate: env.cand,
                sdpMid: env.mid ?? null,
                sdpMLineIndex: env.mlineidx ?? null,
              });
            } catch (err) {
              console.warn("voice: addIceCandidate failed", err);
            }
          }
        }
        break;
      case "presence":
        this.applyPresence(env);
        break;
      case "react":
        if (env.member && env.emoji) {
          this.opts.onReaction?.(env.member, env.emoji);
        }
        break;
      case "error":
        this.setState({ phase: "failed", error: env.error ?? "unknown" });
        this.teardown();
        break;
    }
  }

  private async onJoined(env: SignalEnvelope) {
    // Re-entrance guard: a duplicate "joined" envelope (e.g. server
    // re-issued one after a transient failure, or a leaked handler
    // from a previous VoiceClient instance) must not spawn a second
    // RTCPeerConnection. The old PC's ICE gatherer would otherwise
    // keep emitting candidates forever, flooding the channel.
    if (this.pc) {
      console.warn("voice: ignoring duplicate 'joined' envelope");
      return;
    }
    const iceServers: IceServerConfig[] = [
      { urls: "stun:stun.l.google.com:19302" },
    ];
    if (env.turn) {
      iceServers.push({
        urls: env.turn.urls,
        username: env.turn.username,
        credential: env.turn.password,
      });
    }
    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      this.sendSignal({
        type: "ice",
        cand: e.candidate.candidate,
        mid: e.candidate.sdpMid ?? undefined,
        mlineidx: e.candidate.sdpMLineIndex ?? undefined,
      });
    };
    pc.ontrack = (e) => {
      this.attachInboundTrack(e.track, e.streams[0], e.transceiver?.mid);
    };

    // Capture mic.
    let local: MediaStream;
    try {
      local = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (err) {
      this.setState({ phase: "failed", error: `microphone: ${err}` });
      this.teardown();
      return;
    }
    this.localStream = local;
    for (const t of local.getAudioTracks()) {
      pc.addTrack(t, local);
    }
    this.startVAD(local);

    // Pre-populate the member map from the join reply.
    const members: Record<string, VoiceMember> = {};
    for (const m of env.members ?? []) {
      members[m] = blankMember(m);
    }
    members[this.opts.selfNick] = blankMember(this.opts.selfNick);
    this.members = members;
    this.setState({ phase: "connected", members: { ...members } });
    this.startStatsPump();

    // Initial offer.
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);
    this.sendSignal({ type: "offer", sdp: offer.sdp ?? "" });
  }

  private async renegotiate() {
    if (!this.pc) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ type: "offer", sdp: offer.sdp ?? "" });
  }

  private attachInboundTrack(
    track: MediaStreamTrack,
    stream: MediaStream | undefined,
    mid: string | null | undefined,
  ) {
    // Resolution order (most-reliable first):
    //   1. transceiver.mid -- preserved across all browsers and
    //      directly tied to the SDP m-line our server pushed.
    //   2. SFU-supplied trackOwners hint (track.id -> nick).
    //   3. MediaStream.id -- works when the browser honors a=msid
    //      (Firefox doesn't, for tracks added mid-session).
    //   4. track.id prefix split -- "<nick>-audio" / "<nick>-video".
    let nick: string | null = null;
    if (mid && this.midOwners[mid]) {
      nick = this.midOwners[mid];
    } else if (track.id && this.trackOwners[track.id]) {
      nick = this.trackOwners[track.id];
    } else {
      const sid = stream?.id;
      if (sid && this.members[sid]) {
        nick = sid;
      } else if (track.id) {
        const dash = track.id.lastIndexOf("-");
        const prefix = dash > 0 ? track.id.slice(0, dash) : track.id;
        if (this.members[prefix]) nick = prefix;
      }
    }
    if (!nick) {
      console.warn("voice: ignoring inbound track with no known owner", {
        mid,
        streamId: stream?.id,
        trackId: track.id,
        knownMembers: Object.keys(this.members),
        knownTrackOwners: Object.keys(this.trackOwners),
        knownMidOwners: Object.keys(this.midOwners),
      });
      return;
    }
    // Make sure the owner exists in members even if presence raced
    // ahead of (or behind) the track delivery.
    if (!this.members[nick]) {
      this.members[nick] = blankMember(nick);
    }
    const member = this.members[nick];
    if (track.kind === "audio") {
      member.audioTrack = track;
      // Honor any pre-existing local-mute the user toggled before
      // this peer's audio track actually arrived.
      if (this.localMutes.has(nick)) {
        track.enabled = false;
        member.volume = 0;
      }
    } else if (track.kind === "video") {
      member.videoTrack = track;
    }
    this.members[nick] = member;

    // Pipe inbound audio through the shared sink so Safari plays it.
    if (track.kind === "audio") {
      const sink = this.opts.audioSink;
      // Append the track to a continuous MediaStream on the sink.
      let combined: MediaStream;
      if (sink.srcObject instanceof MediaStream) {
        combined = sink.srcObject;
        for (const old of combined.getAudioTracks()) {
          if (old === track) return;
        }
        combined.addTrack(track);
      } else {
        combined = new MediaStream([track]);
        sink.srcObject = combined;
        sink.play().catch(() => {});
      }
    }

    this.setState({
      phase: "connected",
      members: { ...this.members },
    });
  }

  private applyPresence(env: SignalEnvelope) {
    if (!env.member) return;
    const m = this.members[env.member] ?? blankMember(env.member);
    if (env.state === "joined") {
      this.members[env.member] = m;
    } else if (env.state === "left") {
      delete this.members[env.member];
    } else if (env.state === "on" || env.state === "off") {
      // mic / video / screen / hand toggles arrive as state on/off.
      // The Kind field carries which specific control changed (the
      // envelope Type itself is "presence" because that's what
      // onSignal dispatched on).
      const which = env.kind;
      if (which === "mic") m.micOn = env.state === "on";
      else if (which === "video") m.videoOn = env.state === "on";
      else if (which === "screen") m.screenSharing = env.state === "on";
      else if (which === "hand") m.handRaised = env.state === "on";
      this.members[env.member] = m;
    } else if (env.state === "speaking" || env.state === "silent") {
      m.speaking = env.state === "speaking";
      this.members[env.member] = m;
    } else if (env.state === "deaf-on" || env.state === "deaf-off") {
      m.deafened = env.state === "deaf-on";
      this.members[env.member] = m;
    }
    this.setState({ phase: "connected", members: { ...this.members } });
  }

  /* ------- VAD: emit speaking / silent on threshold cross ------- */

  private startVAD(stream: MediaStream) {
    try {
      const ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      this.vadAudioCtx = ctx;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastChange = 0;
      this.speakingTimer = setInterval(() => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (const v of data) sum += v;
        const avg = sum / data.length;
        const speaking = avg > 25; // empirical threshold
        const now = Date.now();
        if (speaking !== this.isSpeakingNow && now - lastChange > 200) {
          this.isSpeakingNow = speaking;
          lastChange = now;
          this.sendSignal({
            type: speaking ? "speaking" : "silent",
            state: speaking ? "speaking" : "silent",
          });
        }
      }, 100);
    } catch (err) {
      // VAD is a nice-to-have; if AudioContext fails we just don't
      // emit speaking events.
      console.warn("voice: VAD setup failed", err);
    }
  }

  private async drainPendingIce(): Promise<void> {
    if (!this.pc || this.pendingIce.length === 0) return;
    const queue = this.pendingIce;
    this.pendingIce = [];
    for (const c of queue) {
      try {
        await this.pc.addIceCandidate(c);
      } catch (err) {
        console.warn("voice: drained ICE failed", err);
      }
    }
  }

  private setState(next: VoiceState) {
    this.state = next;
    this.opts.onState(next);
  }

  private startStatsPump(): void {
    if (this.statsTimer) return;
    this.statsTimer = setInterval(async () => {
      if (!this.pc) return;
      try {
        const stats = await this.pc.getStats();
        // Map ssrc/track-id -> packet-loss ratio computed from
        // inbound-rtp reports. Then attribute to a member via the
        // trackOwners map (track id) or stream-id fallback. Each peer
        // gets a quality label from the worst stream associated with
        // them.
        const perTrack: Record<string, { lost: number; total: number }> = {};
        stats.forEach((report) => {
          if (
            report.type === "inbound-rtp" &&
            typeof report.trackIdentifier === "string"
          ) {
            const tid = report.trackIdentifier as string;
            const lost = (report.packetsLost as number) ?? 0;
            const recv = (report.packetsReceived as number) ?? 0;
            const total = lost + recv;
            if (total > 0) perTrack[tid] = { lost, total };
          }
        });
        let dirty = false;
        for (const [trackId, owner] of Object.entries(this.trackOwners)) {
          const m = this.members[owner];
          if (!m) continue;
          const stat = perTrack[trackId];
          if (!stat) continue;
          const ratio = stat.lost / Math.max(1, stat.total);
          const next: VoiceMember["quality"] =
            ratio < 0.02 ? "good" : ratio < 0.08 ? "ok" : "poor";
          if (m.quality !== next) {
            m.quality = next;
            dirty = true;
          }
        }
        if (dirty) {
          this.setState({
            phase: "connected",
            members: { ...this.members },
          });
        }
      } catch {
        // ignore -- transient errors during teardown etc.
      }
    }, 3000);
  }

  private teardown() {
    if (this.speakingTimer) {
      clearInterval(this.speakingTimer);
      this.speakingTimer = undefined;
    }
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = undefined;
    }
    if (this.vadAudioCtx) {
      void this.vadAudioCtx.close();
      this.vadAudioCtx = undefined;
    }
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = undefined;
    }
    if (this.screenStream) {
      for (const t of this.screenStream.getTracks()) t.stop();
      this.screenStream = undefined;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = undefined;
    }
    if (this.tagmsgUnsub) {
      this.tagmsgUnsub();
      this.tagmsgUnsub = undefined;
    }
    this.members = {};
    this.trackOwners = {};
    this.midOwners = {};
    this.localMutes.clear();
    this.pendingIce = [];
    this.setState({ phase: "idle" });
  }
}

function randomChunkId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function blankMember(nick: string): VoiceMember {
  return {
    nick,
    micOn: false,
    videoOn: false,
    speaking: false,
    deafened: false,
    screenSharing: false,
    handRaised: false,
    volume: 1,
    quality: "unknown",
  };
}

/* =====================================================================
 * Live-call registry
 *
 * The React VoiceChannelView mounts/unmounts whenever the user
 * navigates between channels. If the VoiceClient lifecycle were tied
 * to the component lifecycle, every nav round-trip would PART/JOIN the
 * voice channel and trip the server's join-throttle ("too many joins,
 * please wait a while").
 *
 * Keep one VoiceClient per (server, channel) alive at module scope.
 * Views acquire/release; the call only actually disconnects when
 * release() is called explicitly (e.g. from the hangup button) or the
 * underlying IRC connection drops.
 * ===================================================================== */

let sharedAudioSink: HTMLAudioElement | null = null;

function getSharedAudioSink(): HTMLAudioElement {
  if (sharedAudioSink) return sharedAudioSink;
  const el = document.createElement("audio");
  el.autoplay = true;
  el.style.display = "none";
  el.setAttribute("data-obsidian-voice", "true");
  document.body.appendChild(el);
  sharedAudioSink = el;
  return el;
}

const liveClients = new Map<string, VoiceClient>();

function clientKey(serverId: string, channel: string): string {
  return `${serverId}\x00${channel}`;
}

export interface AcquireOptions {
  serverId: string;
  channel: string;
  selfNick: string;
  onState: (s: VoiceState) => void;
  onError: (e: string) => void;
  onReaction?: (nick: string, emoji: string) => void;
}

export function acquireVoiceClient(opts: AcquireOptions): VoiceClient {
  const key = clientKey(opts.serverId, opts.channel);
  const existing = liveClients.get(key);
  if (existing) {
    existing.attach({
      onState: opts.onState,
      onError: opts.onError,
      onReaction: opts.onReaction,
    });
    return existing;
  }
  const c = new VoiceClient({
    ...opts,
    audioSink: getSharedAudioSink(),
  });
  liveClients.set(key, c);
  void c.join();
  return c;
}

export function releaseVoiceClient(serverId: string, channel: string): void {
  const key = clientKey(serverId, channel);
  const c = liveClients.get(key);
  if (!c) return;
  c.leave();
  liveClients.delete(key);
}

export function hasActiveVoiceClient(
  serverId: string,
  channel: string,
): boolean {
  return liveClients.has(clientKey(serverId, channel));
}

/** Drop all live calls -- call when the IRC connection itself drops,
 *  or on full client logout, so we don't leak peer connections. */
export function shutdownAllVoiceClients(): void {
  for (const c of liveClients.values()) c.leave();
  liveClients.clear();
}
