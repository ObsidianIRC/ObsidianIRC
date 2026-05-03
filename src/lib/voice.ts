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
    | "screen";
  channel?: string;
  sdp?: string;
  cand?: string;
  mid?: string;
  mlineidx?: number;
  state?: string;
  members?: string[];
  member?: string;
  turn?: { urls: string[]; username: string; password: string };
  error?: string;
}

const RTC_TAG = "+obsidianirc/rtc";

function escapeIrcTagValue(s: string): string {
  // Inverse of obbyircd's escaping in voice-channels.c.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\:")
    .replace(/ /g, "\\s")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
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
  private state: VoiceState = { phase: "idle" };
  private tagmsgUnsub?: () => void;
  private speakingTimer?: ReturnType<typeof setInterval>;
  private vadAudioCtx?: AudioContext;
  private isSpeakingNow = false;

  constructor(opts: VoiceClientOptions) {
    this.opts = opts;
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
    if (this.state.phase === "idle") return;
    this.sendSignal({ type: "leave", channel: this.opts.channel });
    ircClient.sendRaw(this.opts.serverId, `PART ${this.opts.channel}`);
    this.teardown();
  }

  setMic(on: boolean): void {
    if (!this.localStream) return;
    for (const t of this.localStream.getAudioTracks()) t.enabled = on;
    this.sendSignal({ type: "mic", state: on ? "on" : "off" });
  }

  async setVideo(on: boolean): Promise<void> {
    if (!this.pc || !this.localStream) return;
    if (on) {
      try {
        const video = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const track = video.getVideoTracks()[0];
        this.localStream.addTrack(track);
        this.pc.addTrack(track, this.localStream);
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
      // Renegotiate so the SFU drops the video.
      await this.renegotiate();
    }
    this.sendSignal({ type: "video", state: on ? "on" : "off" });
  }

  async setScreenShare(on: boolean): Promise<void> {
    if (!this.pc) return;
    if (on) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        this.screenStream = screen;
        const track = screen.getVideoTracks()[0];
        this.pc.addTrack(track, screen);
        track.onended = () => this.setScreenShare(false);
        await this.renegotiate();
      } catch (err) {
        this.opts.onError(`screen: ${err}`);
        return;
      }
    } else if (this.screenStream) {
      for (const t of this.screenStream.getTracks()) t.stop();
      this.screenStream = undefined;
      await this.renegotiate();
    }
    this.sendSignal({ type: "screen", state: on ? "on" : "off" });
  }

  /* ------- signaling ------- */

  private sendSignal(env: SignalEnvelope) {
    const json = JSON.stringify(env);
    const escaped = escapeIrcTagValue(json);
    ircClient.sendRaw(
      this.opts.serverId,
      `@${RTC_TAG}=${escaped} TAGMSG ${this.opts.channel}`,
    );
  }

  private async onSignal(sender: string, _target: string, env: SignalEnvelope) {
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
        }
        break;
      case "ice":
        if (env.cand && this.pc) {
          await this.pc.addIceCandidate({
            candidate: env.cand,
            sdpMid: env.mid ?? null,
            sdpMLineIndex: env.mlineidx ?? null,
          });
        }
        break;
      case "presence":
        this.applyPresence(env);
        break;
      case "error":
        this.setState({ phase: "failed", error: env.error ?? "unknown" });
        this.teardown();
        break;
    }
  }

  private async onJoined(env: SignalEnvelope) {
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
      this.attachInboundTrack(e.track, e.streams[0]);
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
  ) {
    // The SFU labels each fanned-out track with the original
    // publisher's nick in the streamId (see voice.go fanOutTrack).
    const streamId = stream?.id ?? "unknown";
    const member = this.members[streamId] ?? blankMember(streamId);
    if (track.kind === "audio") member.audioTrack = track;
    else if (track.kind === "video") member.videoTrack = track;
    this.members[streamId] = member;

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
      // mic / video / screen toggles arrive as state on/off in the
      // same envelope -- the type field tells us which.
      const which = env.type;
      if (which === "mic") m.micOn = env.state === "on";
      else if (which === "video") m.videoOn = env.state === "on";
      else if (which === "screen") m.screenSharing = env.state === "on";
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

  private setState(next: VoiceState) {
    this.state = next;
    this.opts.onState(next);
  }

  private teardown() {
    if (this.speakingTimer) {
      clearInterval(this.speakingTimer);
      this.speakingTimer = undefined;
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
    this.setState({ phase: "idle" });
  }
}

function blankMember(nick: string): VoiceMember {
  return {
    nick,
    micOn: false,
    videoOn: false,
    speaking: false,
    deafened: false,
    screenSharing: false,
  };
}
