// Discord-style voice channel UI.  Mounted in place of ChatArea when
// the user has selected a `^channel`.  Owns one VoiceClient per
// (server, channel) and renders the participant grid + controls.
//
// Audio playback is funneled through a single hidden <audio> element
// so Safari's autoplay policies cooperate; video is rendered per-tile
// via a <video> bound to the inbound MediaStreamTrack.

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaDesktop,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhoneSlash,
  FaVideo,
  FaVideoSlash,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import {
  VoiceClient,
  type VoiceMember,
  type VoiceState,
} from "../../lib/voice";
import useStore from "../../store";

interface Props {
  serverId: string;
  channelName: string;
}

export const VoiceChannelView: React.FC<Props> = ({
  serverId,
  channelName,
}) => {
  const [state, setState] = useState<VoiceState>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<VoiceClient | null>(null);

  // Self nick from the IRC client.
  const selfNick = useMemo(() => {
    const u = ircClient.getCurrentUser(serverId);
    return u?.username || "you";
  }, [serverId]);

  // Keep a ref to the current store action so cleanup can use it
  // without re-binding the effect on every store update.
  const selectChannel = useStore((s) => s.selectChannel);

  useEffect(() => {
    if (!audioRef.current) return;
    const client = new VoiceClient({
      serverId,
      channel: channelName,
      selfNick,
      onState: (s) => setState(s),
      onError: (e) => setError(e),
      audioSink: audioRef.current,
    });
    clientRef.current = client;
    void client.join();
    return () => {
      client.leave();
      clientRef.current = null;
    };
  }, [serverId, channelName, selfNick]);

  const onToggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    clientRef.current?.setMic(next);
  };
  const onToggleVideo = () => {
    const next = !videoOn;
    setVideoOn(next);
    void clientRef.current?.setVideo(next);
  };
  const onToggleScreen = () => {
    const next = !screenOn;
    setScreenOn(next);
    void clientRef.current?.setScreenShare(next);
  };
  const onToggleDeafen = () => {
    const next = !deafened;
    setDeafened(next);
    if (audioRef.current) audioRef.current.muted = next;
  };
  const onLeave = () => {
    clientRef.current?.leave();
    // Bounce to the server's first text channel.
    const srv = useStore.getState().servers.find((s) => s.id === serverId);
    const firstText = srv?.channels.find((c) => c.name.startsWith("#"));
    if (firstText) selectChannel(firstText.id);
  };

  const members =
    state.phase === "connected" ? Object.values(state.members) : [];

  return (
    <div className="w-full h-full flex flex-col bg-discord-dark-200">
      <header className="px-4 py-3 border-b border-discord-dark-300">
        <h2 className="text-white text-lg font-medium">
          🔊 {channelName.replace(/^\^/, "")}
        </h2>
        <p className="text-xs text-discord-text-muted">
          {state.phase === "joining" && "Connecting…"}
          {state.phase === "connected" &&
            `${members.length} ${members.length === 1 ? "member" : "members"}`}
          {state.phase === "failed" && `Connection failed: ${state.error}`}
          {state.phase === "idle" && "Ready"}
        </p>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {members.map((m) => (
            <ParticipantTile
              key={m.nick}
              member={m}
              isSelf={m.nick === selfNick}
              selfMicOn={micOn}
            />
          ))}
        </div>
        {state.phase === "connected" && members.length === 0 && (
          <p className="text-discord-text-muted text-sm italic mt-8 text-center">
            Just you for now. Tell someone to /join {channelName} to chat.
          </p>
        )}
        {error && <p className="text-discord-red text-xs mt-4">{error}</p>}
      </main>

      <footer className="border-t border-discord-dark-300 p-3 flex items-center justify-center gap-2">
        <ControlButton
          on={micOn}
          onClick={onToggleMic}
          IconOn={FaMicrophone}
          IconOff={FaMicrophoneSlash}
          label={micOn ? "Mute" : "Unmute"}
        />
        <ControlButton
          on={videoOn}
          onClick={onToggleVideo}
          IconOn={FaVideo}
          IconOff={FaVideoSlash}
          label={videoOn ? "Stop video" : "Start video"}
        />
        <ControlButton
          on={screenOn}
          onClick={onToggleScreen}
          IconOn={FaDesktop}
          IconOff={FaDesktop}
          label={screenOn ? "Stop sharing" : "Share screen"}
        />
        <ControlButton
          on={!deafened}
          onClick={onToggleDeafen}
          IconOn={FaVolumeUp}
          IconOff={FaVolumeMute}
          label={deafened ? "Undeafen" : "Deafen"}
        />
        <button
          type="button"
          onClick={onLeave}
          className="ml-4 px-4 py-2 rounded-full bg-discord-red text-white flex items-center gap-2 hover:opacity-90"
          title="Leave voice"
        >
          <FaPhoneSlash />
          Leave
        </button>
      </footer>

      {/* Hidden sink for inbound audio.  Safari requires a real
          element on the page for autoplay to fire. */}
      <audio ref={audioRef} autoPlay playsInline className="hidden">
        <track kind="captions" />
      </audio>
    </div>
  );
};

function ControlButton({
  on,
  onClick,
  IconOn,
  IconOff,
  label,
}: {
  on: boolean;
  onClick: () => void;
  IconOn: React.ComponentType;
  IconOff: React.ComponentType;
  label: string;
}) {
  const Icon = on ? IconOn : IconOff;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
        on
          ? "bg-discord-dark-300 text-white hover:bg-discord-dark-400"
          : "bg-discord-red text-white hover:opacity-90"
      }`}
    >
      <Icon />
    </button>
  );
}

function ParticipantTile({
  member,
  isSelf,
  selfMicOn,
}: {
  member: VoiceMember;
  isSelf: boolean;
  selfMicOn: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!videoRef.current) return;
    if (member.videoTrack) {
      const stream = new MediaStream([member.videoTrack]);
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.srcObject = null;
    }
  }, [member.videoTrack]);

  const showSpeakingRing = member.speaking && (isSelf ? selfMicOn : true);

  return (
    <div
      className={`relative bg-discord-dark-300 rounded-lg aspect-video overflow-hidden flex items-center justify-center ${
        showSpeakingRing
          ? "ring-2 ring-discord-green"
          : "ring-1 ring-discord-dark-200"
      }`}
    >
      {member.videoTrack ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted={isSelf}
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-discord-dark-100 flex items-center justify-center text-white text-2xl font-bold">
          {member.nick[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <div className="absolute bottom-1 left-1 right-1 px-2 py-0.5 rounded bg-black/50 text-white text-xs flex items-center gap-1.5">
        <span className="truncate flex-1">{member.nick}</span>
        {!member.micOn && !isSelf && (
          <FaMicrophoneSlash className="text-discord-red flex-shrink-0" />
        )}
        {isSelf && !selfMicOn && (
          <FaMicrophoneSlash className="text-discord-red flex-shrink-0" />
        )}
        {member.deafened && (
          <FaVolumeMute className="text-discord-red flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

export default VoiceChannelView;
