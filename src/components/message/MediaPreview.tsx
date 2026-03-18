import exifr from "exifr";
import type * as React from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  FaPause,
  FaPlay,
  FaSpinner,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa";
import { getAudio } from "../../lib/audioManager";
import ircClient from "../../lib/ircClient";
import { probeMediaUrl } from "../../lib/mediaProbe";
import {
  filenameFromUrl,
  getEmbedThumbnailUrl,
  type MediaEntry,
  type MediaType,
} from "../../lib/mediaUtils";
import {
  getVideoPosition,
  setVideoPosition,
} from "../../lib/videoPositionCache";
import useStore from "../../store";

const ReactPlayer = lazy(() => import("react-player"));
const LazyDocument = lazy(() =>
  import("react-pdf").then((m) => ({ default: m.Document })),
);
const LazyPage = lazy(() =>
  import("react-pdf").then((m) => ({ default: m.Page })),
);

function extractJpegComment(uint8Array: Uint8Array): string | null {
  if (
    uint8Array.length < 4 ||
    uint8Array[0] !== 0xff ||
    uint8Array[1] !== 0xd8
  ) {
    return null;
  }

  let offset = 2;

  while (offset < uint8Array.length - 1) {
    if (uint8Array[offset] !== 0xff) {
      break;
    }

    const marker = uint8Array[offset + 1];
    const markerLength = (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];

    if (marker === 0xfe) {
      const commentData = uint8Array.slice(
        offset + 4,
        offset + markerLength + 2,
      );
      try {
        return new TextDecoder("utf-8").decode(commentData);
      } catch (e) {
        return String.fromCharCode.apply(null, Array.from(commentData));
      }
    }

    offset += markerLength + 2;

    if (marker === 0xda) {
      break;
    }
  }

  return null;
}

const FilehostImageBanner: React.FC<{
  exifData: { author?: string; jwt_expiry?: string; server_expiry?: string };
  serverId?: string;
  onOpenProfile?: (username: string) => void;
}> = ({ exifData, serverId, onOpenProfile }) => {
  const currentUser = serverId ? ircClient.getCurrentUser(serverId) : null;

  if (!exifData.author) return null;

  const [ircNick, ircAccount] = exifData.author.split(":");
  const isVerified =
    currentUser?.account &&
    ircAccount !== "0" &&
    currentUser.account.toLowerCase() === ircAccount.toLowerCase();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenProfile) {
      onOpenProfile(ircNick);
    }
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded-b-lg flex items-center cursor-pointer hover:bg-opacity-90 transition-opacity"
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        <span>{ircNick}</span>
        {isVerified && (
          <svg
            className="w-3 h-3 text-green-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

const ImagePreview: React.FC<{
  url: string;
  msgid?: string;
  isFilehostImage?: boolean;
  serverId?: string;
  channelId?: string;
  onOpenProfile?: (username: string) => void;
}> = ({
  url,
  msgid,
  isFilehostImage = false,
  serverId,
  channelId,
  onOpenProfile,
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const openMedia = useStore((state) => state.openMedia);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [exifData, setExifData] = useState<{
    author?: string;
    jwt_expiry?: string;
    server_expiry?: string;
  } | null>(null);
  const [exifError, setExifError] = useState(false);

  useEffect(() => {
    const resolveTenorUrl = async (sharingUrl: string) => {
      try {
        const match = sharingUrl.match(/tenor\.com\/view\/.*-gif-(\d+)/);
        if (!match) return sharingUrl;

        const gifId = match[1];
        const apiKey = import.meta.env.VITE_TENOR_API_KEY;

        if (!apiKey) return sharingUrl;

        const response = await fetch(
          `https://tenor.googleapis.com/v2/posts?ids=${gifId}&key=${apiKey}`,
        );

        if (!response.ok) return sharingUrl;

        const data = await response.json();
        if (data.results?.[0]?.media_formats) {
          const media = data.results[0].media_formats;
          return (
            media.gif?.url ||
            media.mediumgif?.url ||
            media.tinygif?.url ||
            sharingUrl
          );
        }
      } catch (error) {
        console.warn("Failed to resolve Tenor URL:", error);
      }
      return sharingUrl;
    };

    const processUrl = async () => {
      let finalUrl = url;

      if (url.match(/tenor\.com\/view\//)) {
        finalUrl = await resolveTenorUrl(url);
        setResolvedUrl(finalUrl);
      } else {
        setResolvedUrl(url);
      }

      if (isFilehostImage) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const blob = await response.blob();

          const exif = await exifr.parse(blob);

          let commentData = null;
          if (exif?.Comment) {
            commentData = exif.Comment;
          } else if (exif?.UserComment) {
            commentData = exif.UserComment;
          } else if (exif?.ImageDescription) {
            commentData = exif.ImageDescription;
          } else if (exif?.iptc?.Caption) {
            commentData = exif.iptc.Caption;
          } else if (exif?.xmp?.description) {
            commentData = exif.xmp.description;
          }

          if (!commentData) {
            try {
              const arrayBuffer = await blob.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              commentData = extractJpegComment(uint8Array);
            } catch (error) {
              console.warn("Failed to manually parse JPEG comment:", error);
            }
          }

          if (commentData) {
            try {
              const parsedData = JSON.parse(commentData);
              setExifData({
                author: parsedData.author,
                jwt_expiry: parsedData.jwt_expiry,
                server_expiry: parsedData.server_expiry,
              });
            } catch {
              setExifError(true);
            }
          } else {
            setExifError(true);
          }
        } catch {
          setExifError(true);
        }
      }
    };

    processUrl();
  }, [url, isFilehostImage]);

  const displayUrl = resolvedUrl || url;

  if (imageError) {
    return (
      <div className="max-w-md">
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-red-100 text-red-800 border border-red-200">
            <span>This image has expired</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <div className="relative inline-block rounded border border-discord-dark-500/50 overflow-hidden">
        {!imageLoaded && !imageError && (
          <div
            className="flex items-center justify-center bg-discord-dark-400/50"
            style={{ width: "200px", height: "150px" }}
          >
            <FaSpinner className="text-discord-text-muted animate-spin text-lg" />
          </div>
        )}
        <img
          src={displayUrl}
          alt={isFilehostImage ? "Filehost image" : "GIF"}
          loading="lazy"
          className={`max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity transparency-grid ${
            imageLoaded ? "block" : "hidden"
          }`}
          onClick={() => openMedia(displayUrl, msgid, serverId, channelId)}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          style={{ maxHeight: "150px" }}
        />
        {isFilehostImage && exifData && imageLoaded && (
          <FilehostImageBanner
            exifData={exifData}
            serverId={serverId}
            onOpenProfile={onOpenProfile}
          />
        )}
      </div>
    </div>
  );
};

function formatVideoTime(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const VideoPreview: React.FC<{
  url: string;
  msgid?: string;
  serverId?: string;
  channelId?: string;
}> = ({ url, msgid, serverId, channelId }) => {
  const activeMedia = useStore((state) => state.ui.activeMedia);
  const openMedia = useStore((state) => state.openMedia);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Use refs for seek bar and time display — avoids React re-renders on every timeupdate,
  // which stalls WKWebView's video compositing layer.
  const seekRef = useRef<HTMLInputElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const wasActiveRef = useRef(false);
  const thumbnailCapturedRef = useRef(false);

  const isActive = activeMedia?.url === url;
  const isPlaying = isActive && activeMedia?.isPlaying === true;

  // Drive the video element from store state — source of truth for play/pause.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!isActive) {
      // Only reset on deactivation (X button), not on initial mount.
      if (wasActiveRef.current) {
        video.pause();
        video.currentTime = 0;
        if (seekRef.current) seekRef.current.value = "0";
        if (timeDisplayRef.current) timeDisplayRef.current.textContent = "0:00";
      }
      wasActiveRef.current = false;
      return;
    }
    wasActiveRef.current = true;
    if (isPlaying) {
      if (video.paused) video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isActive, isPlaying]);

  const isThisVideoActive =
    activeMedia?.url === url && activeMedia?.type === "video";

  // Signal the store on mount/unmount so MiniMediaPlayer knows whether to
  // drive its own hidden <video>. Inline video is always the audio source while
  // mounted — display:none (keep-alive channel switch) does not stop playback.
  useEffect(() => {
    if (!isThisVideoActive) return;
    useStore.getState().setMediaInlineVisible(true);
    return () => {
      const t = videoRef.current?.currentTime;
      if (t !== undefined && t > 0) setVideoPosition(url, t);
      useStore.getState().setMediaInlineVisible(false, t);
    };
  }, [isThisVideoActive, url]);

  // Native event listeners for timeupdate/loadedmetadata/ended — more reliable in
  // WKWebView than React synthetic events, which can be silently dropped.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Initialize the ref-controlled time display so it isn't blank on mount.
    if (timeDisplayRef.current && !timeDisplayRef.current.textContent)
      timeDisplayRef.current.textContent = "0:00";

    const onTimeUpdate = () => {
      const t = video.currentTime;
      if (seekRef.current) seekRef.current.value = String(t);
      if (timeDisplayRef.current)
        timeDisplayRef.current.textContent = formatVideoTime(t);
    };

    const onLoadedMetadata = () => {
      const d = video.duration ?? 0;
      setDuration(d);
      if (seekRef.current) seekRef.current.max = String(d);
      // Restore position after channel-switch or scroll-back via videoPositionCache.
      const saved = getVideoPosition(url);
      if (saved !== undefined && saved > 0 && saved < d) {
        video.currentTime = saved;
        if (seekRef.current) seekRef.current.value = String(saved);
        if (timeDisplayRef.current)
          timeDisplayRef.current.textContent = formatVideoTime(saved);
      }
    };

    const onEnded = () => useStore.getState().pauseActiveMedia();
    const onError = () => setLoadError(true);

    // Capture thumbnail via a separate CORS-enabled element so the main player
    // is never affected by crossOrigin restrictions. Falls back silently if the
    // server doesn't support CORS.
    thumbnailCapturedRef.current = false;
    let thumbVideo: HTMLVideoElement | null = document.createElement("video");
    thumbVideo.crossOrigin = "anonymous";
    thumbVideo.preload = "auto";
    thumbVideo.muted = true;
    thumbVideo.src = url;
    const releaseThumbVideo = () => {
      if (thumbVideo) {
        thumbVideo.src = "";
        thumbVideo = null;
      }
    };
    thumbVideo.addEventListener(
      "loadeddata",
      () => {
        if (!thumbVideo || thumbVideo.videoWidth === 0) {
          releaseThumbVideo();
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = thumbVideo.videoWidth;
        canvas.height = thumbVideo.videoHeight;
        const ctx = canvas.getContext("2d");
        try {
          if (ctx && !thumbnailCapturedRef.current) {
            ctx.drawImage(thumbVideo, 0, 0);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            setThumbnail(dataUrl);
            thumbnailCapturedRef.current = true;
            // Push thumbnail to store so MiniMediaPlayer bar can show it.
            // Guard by URL — store action is a no-op if different video is active.
            useStore.getState().setActiveMediaThumbnail(url, dataUrl);
          }
        } catch {
          // CORS or security error — no thumbnail for this URL
        }
        releaseThumbVideo();
      },
      { once: true },
    );
    thumbVideo.addEventListener("error", releaseThumbVideo, { once: true });

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    // `loadedmetadata` may have already fired before this effect runs.
    if (video.readyState >= 1) onLoadedMetadata();
    return () => {
      releaseThumbVideo();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      setThumbnail(null);
    };
  }, [url]);

  function handlePlayPause() {
    if (isPlaying) {
      videoRef.current?.pause();
      useStore.getState().pauseActiveMedia();
    } else {
      // Call play() synchronously here — WKWebView requires video.play() to be called
      // within the user gesture handler for unmuted audio-containing media.
      // Calling it from useEffect (async, post-render) loses the gesture context.
      videoRef.current?.play().catch(() => {});
      useStore
        .getState()
        .playMedia(
          url,
          "video",
          thumbnail ?? undefined,
          msgid,
          serverId,
          channelId,
        );
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = t;
    if (timeDisplayRef.current)
      timeDisplayRef.current.textContent = formatVideoTime(t);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
  }

  function handleToggleMute() {
    const next = volume === 0 ? 1 : 0;
    setVolume(next);
    if (videoRef.current) videoRef.current.volume = next;
  }

  if (loadError) {
    return (
      <div className="max-w-md">
        <div className="flex items-center gap-2 py-2 px-3 rounded border border-discord-dark-500/50 bg-discord-dark-400/30 text-discord-text-muted text-xs">
          <svg
            className="w-4 h-4 shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
          <span className="truncate">
            {url.split("/").pop()?.split("?")[0] || "video"}
          </span>
          <span className="text-discord-text-muted/60">— unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="max-w-md">
      <div className="relative inline-block rounded-lg overflow-hidden bg-black shadow-lg group">
        {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded IRC videos have no caption tracks */}
        <video
          ref={videoRef}
          src={url}
          preload="metadata"
          playsInline
          style={{ maxHeight: "360px", maxWidth: "100%", display: "block" }}
          className="cursor-pointer"
          onClick={handlePlayPause}
        />
        <>
          {thumbnail && !isPlaying && (
            <img
              src={thumbnail}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}
          {!isPlaying && (
            <button
              type="button"
              aria-label="Play"
              onClick={handlePlayPause}
              className="absolute inset-0 flex items-center justify-center z-10"
            >
              <div className="bg-black/50 backdrop-blur-sm rounded-full p-5 text-white hover:scale-110 hover:bg-black/70 transition-all duration-150 shadow-xl">
                <FaPlay className="w-7 h-7 ml-0.5" />
              </div>
            </button>
          )}
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pt-8 pb-2 px-3 transition-opacity duration-200 ${
              isPlaying
                ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                : "opacity-100"
            }`}
          >
            <div className="flex items-center gap-2 text-white">
              <button
                type="button"
                aria-label={isPlaying ? "Pause" : "Play"}
                className="shrink-0 hover:scale-110 transition-transform"
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <FaPause className="w-3.5 h-3.5" />
                ) : (
                  <FaPlay className="w-3.5 h-3.5" />
                )}
              </button>
              <span
                ref={timeDisplayRef}
                className="text-xs tabular-nums shrink-0 text-white/75"
              />
              <input
                ref={seekRef}
                type="range"
                min={0}
                max={duration > 0 ? duration : 0}
                step={0.1}
                defaultValue={0}
                onChange={handleSeek}
                className="flex-1 h-0.5 accent-white cursor-pointer rounded-full"
                aria-label="Seek"
              />
              <span className="text-xs tabular-nums shrink-0 text-white/40">
                {formatVideoTime(duration)}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-label={volume === 0 ? "Unmute" : "Mute"}
                  className="shrink-0 hover:scale-110 transition-transform text-white/75 hover:text-white"
                  onClick={handleToggleMute}
                >
                  {volume === 0 ? (
                    <FaVolumeMute className="w-3.5 h-3.5" />
                  ) : (
                    <FaVolumeUp className="w-3.5 h-3.5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-14 h-0.5 accent-white cursor-pointer"
                  aria-label="Volume"
                />
              </div>
            </div>
          </div>
        </>
      </div>
    </div>
  );
};

const AudioPreview: React.FC<{
  url: string;
  msgid?: string;
  serverId?: string;
  channelId?: string;
}> = ({ url, msgid, serverId, channelId }) => {
  const activeMedia = useStore((state) => state.ui.activeMedia);
  const playMedia = useStore((state) => state.playMedia);
  const pauseActiveMedia = useStore((state) => state.pauseActiveMedia);
  const stopActiveMedia = useStore((state) => state.stopActiveMedia);

  const isActive = activeMedia?.url === url;
  const isPlaying = isActive && activeMedia?.isPlaying;
  const [isLive, setIsLive] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: url resets live state when switching streams
  useEffect(() => {
    if (!isActive) {
      setIsLive(false);
      return;
    }
    const audio = getAudio();
    const onDuration = () =>
      setIsLive(audio.duration === Number.POSITIVE_INFINITY);
    audio.addEventListener("durationchange", onDuration);
    setIsLive(audio.duration === Number.POSITIVE_INFINITY);
    return () => audio.removeEventListener("durationchange", onDuration);
  }, [isActive, url]);

  const filename = filenameFromUrl(url);

  return (
    <div className="mt-2 max-w-sm flex items-center gap-2 py-2 px-3 rounded border border-discord-dark-500/50 bg-discord-dark-400/30">
      <svg
        className="w-4 h-4 text-discord-text-muted shrink-0"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
      </svg>
      <span className="text-xs text-discord-text-muted truncate flex-1">
        {filename || "audio"}
      </span>
      {isActive && isLive && (
        <div className="flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-semibold tracking-widest text-red-400 uppercase">
            Live
          </span>
        </div>
      )}
      {isActive ? (
        <>
          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            className="p-1 rounded hover:bg-discord-dark-500/50 text-discord-text-normal"
            onClick={() =>
              isPlaying
                ? pauseActiveMedia()
                : playMedia(url, "audio", undefined, msgid, serverId, channelId)
            }
          >
            {isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            aria-label="Stop"
            className="p-1 rounded hover:bg-discord-dark-500/50 text-discord-text-muted"
            onClick={() => stopActiveMedia()}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        </>
      ) : (
        <button
          type="button"
          aria-label="Play"
          className="p-1 rounded hover:bg-discord-dark-500/50 text-discord-text-normal"
          onClick={() =>
            playMedia(url, "audio", undefined, msgid, serverId, channelId)
          }
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}
    </div>
  );
};

const EmbedPreview: React.FC<{
  url: string;
  msgid?: string;
  serverId?: string;
  channelId?: string;
}> = ({ url, msgid, serverId, channelId }) => {
  const mediaViewerOpen = useStore((state) => state.ui.openedMedia !== null);
  const activeMedia = useStore((state) => state.ui.activeMedia);
  const playMedia = useStore((state) => state.playMedia);
  const pauseActiveMedia = useStore((state) => state.pauseActiveMedia);
  const setMediaInlineVisible = useStore(
    (state) => state.setMediaInlineVisible,
  );
  const [playerKey, setPlayerKey] = useState(0);

  const isThisEmbedActive =
    activeMedia?.url === url && activeMedia?.type === "embed";

  // Reset the player (remount iframe) when transitioning active → inactive,
  // i.e. the user clicks Stop in the Now Playing Bar. Without this, the YouTube
  // iframe keeps playing because ReactPlayer passes playing={undefined} which
  // doesn't send a stop command.
  const wasEmbedActiveRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: url change itself resets the key via playerKey
  useEffect(() => {
    const isActive = activeMedia?.url === url;
    if (wasEmbedActiveRef.current && !isActive) {
      setPlayerKey((k) => k + 1);
    }
    wasEmbedActiveRef.current = isActive;
  }, [activeMedia?.url, url]);

  // Tell the store when this inline embed player is mounted/unmounted.
  // MiniMediaPlayer renders its own ReactPlayer only when isInlineVisible=false,
  // preventing double-playback while keeping audio alive across channel switches.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setMediaInlineVisible is a stable store action
  useEffect(() => {
    if (!isThisEmbedActive) return;
    setMediaInlineVisible(true);
    return () => {
      setMediaInlineVisible(false);
    };
  }, [isThisEmbedActive]);

  const playing = mediaViewerOpen
    ? false
    : activeMedia?.url === url
      ? activeMedia.isPlaying
      : undefined;

  return (
    <div className="max-w-md relative group">
      <Suspense
        fallback={
          <div className="w-full aspect-video bg-discord-dark-400/50 rounded animate-pulse" />
        }
      >
        <div className="aspect-video">
          <ReactPlayer
            key={playerKey}
            src={url}
            width="100%"
            height="100%"
            controls
            playing={playing}
            style={{ borderRadius: "4px", overflow: "hidden" }}
            onPlay={() => {
              // Guard against spurious onPlay events fired by the YouTube iframe when its
              // container transitions from display:none back to visible (keep-alive channels).
              // If the user explicitly paused (isPlaying=false in store), ignore the event.
              const current = useStore.getState().ui.activeMedia;
              if (current?.url === url && current.isPlaying === false) return;
              playMedia(
                url,
                "embed",
                getEmbedThumbnailUrl(url) ?? undefined,
                msgid,
                serverId,
                channelId,
              );
            }}
            onPause={() => pauseActiveMedia()}
            onEnded={() => {
              // Reset player to beginning and pause — prevents YouTube recommendations screen
              setPlayerKey((k) => k + 1);
              pauseActiveMedia();
            }}
          />
        </div>
      </Suspense>
    </div>
  );
};

const PdfPreview: React.FC<{
  url: string;
  msgid?: string;
  serverId?: string;
  channelId?: string;
}> = ({ url, msgid, serverId, channelId }) => {
  const openMedia = useStore((state) => state.openMedia);
  return (
    <div
      className="max-w-xs cursor-pointer rounded border border-discord-dark-500/50 overflow-hidden hover:opacity-90 transition-opacity"
      onClick={() => openMedia(url, msgid, serverId, channelId)}
    >
      <Suspense
        fallback={
          <div className="w-24 h-32 bg-discord-dark-400/50 animate-pulse" />
        }
      >
        <LazyDocument file={url} loading={null}>
          <LazyPage
            pageNumber={1}
            width={120}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </LazyDocument>
      </Suspense>
    </div>
  );
};

// Probes a URL whose type is unknown, then renders the appropriate preview.
// Probe is deferred until the element is near the viewport (IntersectionObserver).
// Callers must pre-filter URLs through canShowMedia() — probe runs unconditionally here.
const ProbeablePreview: React.FC<{
  url: string;
  msgid?: string;
  isFilehostImage?: boolean;
  serverId?: string;
  channelId?: string;
  onOpenProfile?: (username: string) => void;
  onTypeResolved?: (url: string, type: MediaType) => void;
}> = ({
  url,
  msgid,
  isFilehostImage,
  serverId,
  channelId,
  onOpenProfile,
  onTypeResolved,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [resolvedType, setResolvedType] = useState<MediaType | null>(null);

  useEffect(() => {
    setResolvedType(null);
    const el = wrapperRef.current;
    if (!el) return;
    let cancelled = false;
    // rootMargin starts probe 200px before the element enters the viewport
    // so the preview is ready by the time the user scrolls to it.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        probeMediaUrl(url).then((result) => {
          if (!cancelled && result && !result.skipped) {
            setResolvedType(result.type);
            onTypeResolved?.(url, result.type);
          }
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [url, onTypeResolved]);

  let preview: React.ReactNode = null;
  if (resolvedType === "image") {
    preview = (
      <ImagePreview
        url={url}
        msgid={msgid}
        isFilehostImage={isFilehostImage}
        serverId={serverId}
        channelId={channelId}
        onOpenProfile={onOpenProfile}
      />
    );
  } else if (resolvedType === "video") {
    preview = (
      <VideoPreview
        url={url}
        msgid={msgid}
        serverId={serverId}
        channelId={channelId}
      />
    );
  } else if (resolvedType === "audio") {
    preview = (
      <AudioPreview
        url={url}
        msgid={msgid}
        serverId={serverId}
        channelId={channelId}
      />
    );
  } else if (resolvedType === "pdf") {
    preview = (
      <PdfPreview
        url={url}
        msgid={msgid}
        serverId={serverId}
        channelId={channelId}
      />
    );
  } else if (resolvedType === "embed") {
    preview = (
      <EmbedPreview
        url={url}
        msgid={msgid}
        serverId={serverId}
        channelId={channelId}
      />
    );
  }

  return (
    <div
      ref={wrapperRef}
      style={resolvedType ? undefined : { minHeight: "1px" }}
    >
      {preview}
    </div>
  );
};

export const MediaPreview: React.FC<{
  entry: MediaEntry;
  msgid?: string;
  isFilehostImage?: boolean;
  serverId?: string;
  channelId?: string;
  onOpenProfile?: (username: string) => void;
  onTypeResolved?: (url: string, type: MediaType) => void;
}> = ({
  entry,
  msgid,
  isFilehostImage,
  serverId,
  channelId,
  onOpenProfile,
  onTypeResolved,
}) => {
  if (entry.type === null) {
    return (
      <ProbeablePreview
        url={entry.url}
        msgid={msgid}
        isFilehostImage={isFilehostImage}
        serverId={serverId}
        channelId={channelId}
        onOpenProfile={onOpenProfile}
        onTypeResolved={onTypeResolved}
      />
    );
  }

  switch (entry.type) {
    case "image":
      return (
        <ImagePreview
          url={entry.url}
          msgid={msgid}
          isFilehostImage={isFilehostImage}
          serverId={serverId}
          channelId={channelId}
          onOpenProfile={onOpenProfile}
        />
      );
    case "video":
      return (
        <VideoPreview
          url={entry.url}
          msgid={msgid}
          serverId={serverId}
          channelId={channelId}
        />
      );
    case "audio":
      return (
        <AudioPreview
          url={entry.url}
          msgid={msgid}
          serverId={serverId}
          channelId={channelId}
        />
      );
    case "pdf":
      return (
        <PdfPreview
          url={entry.url}
          msgid={msgid}
          serverId={serverId}
          channelId={channelId}
        />
      );
    case "embed":
      return (
        <EmbedPreview
          url={entry.url}
          msgid={msgid}
          serverId={serverId}
          channelId={channelId}
        />
      );
  }
};
