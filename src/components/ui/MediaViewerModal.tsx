import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  FaComments,
  FaDownload,
  FaExternalLinkAlt,
  FaMinus,
  FaMusic,
  FaPlus,
  FaSpinner,
  FaVideo,
} from "react-icons/fa";
import { useShallow } from "zustand/react/shallow";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { isUrlFromFilehost } from "../../lib/ircUtils";
import { probeMediaUrl } from "../../lib/mediaProbe";
import type { MediaEntry, MediaType } from "../../lib/mediaUtils";
import {
  canShowMedia,
  detectMediaType,
  extractMediaFromMessage,
  getEmbedThumbnailUrl,
} from "../../lib/mediaUtils";
import { openExternalUrl } from "../../lib/openUrl";
import { isTauri } from "../../lib/platformUtils";
import useStore, { getChannelMessages } from "../../store";
import type { Message } from "../../types";
import { ResizableSidebar } from "../layout/ResizableSidebar";
import ExternalLinkWarningModal from "./ExternalLinkWarningModal";
import { MediaCommentsSidebar } from "./MediaCommentsSidebar";

const LazyDocument = lazy(() =>
  import("react-pdf").then((m) => ({ default: m.Document })),
);
const LazyPage = lazy(() =>
  import("react-pdf").then((m) => ({ default: m.Page })),
);
const ReactPlayer = lazy(() => import("react-player"));

const ZOOM_STEP = 0.25;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function formatAudioTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "--:--";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Custom audio player used inside the viewer — avoids browser-native loading indicators. */
const AudioViewerPlayer: React.FC<{ url: string }> = ({ url }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [duration, setDuration] = useState(Number.NaN);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onCanPlay = () => setIsLoading(false);
    const onPlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      setHasError(true);
      setIsLoading(false);
    };
    const onDuration = () => setDuration(audio.duration);
    const onTime = () => setCurrentTime(audio.currentTime);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("timeupdate", onTime);
    return () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("timeupdate", onTime);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setIsLoading(true);
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  // Per the HTML5 media spec, live/unbounded streams always report duration === Infinity.
  // NaN means "not yet known" (before durationchange fires) — not the same as live.
  const isLive = duration === Number.POSITIVE_INFINITY;

  const filename = (() => {
    try {
      return (
        decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "") || url
      );
    } catch {
      return url;
    }
  })();

  return (
    <div
      className="flex flex-col items-center justify-center gap-8 pointer-events-auto w-full px-6 sm:px-12 select-none"
      style={{ maxWidth: "36rem" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: user-linked IRC media, no captions available */}
      <audio ref={audioRef} src={url} hidden />

      {/* Icon + filename */}
      <div className="flex flex-col items-center gap-3">
        <FaMusic
          className="text-discord-text-muted"
          style={{ fontSize: "4rem" }}
        />
        <span className="text-sm text-discord-text-muted text-center break-all">
          {filename}
        </span>
      </div>

      {/* Seek bar / LIVE badge / error */}
      {hasError ? (
        <span className="text-sm text-red-400">Failed to load audio</span>
      ) : isLive ? (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] font-semibold tracking-widest text-red-400 uppercase">
            Live
          </span>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-1.5">
          <input
            type="range"
            className="w-full h-1 cursor-pointer accent-white"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            aria-label="Seek"
            onChange={(e) => {
              if (audioRef.current)
                audioRef.current.currentTime = Number(e.target.value);
            }}
          />
          <div className="flex justify-between text-[11px] text-discord-text-muted tabular-nums">
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Circular play/pause — spinner lives inside the button, not beside it */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={hasError}
        aria-label={isLoading ? "Loading" : isPlaying ? "Pause" : "Play"}
        className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <svg
            className="w-7 h-7 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeOpacity="0.25"
            />
            <path
              d="M12 3a9 9 0 0 1 9 9"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        ) : isPlaying ? (
          <svg
            className="w-7 h-7"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg
            className="w-7 h-7"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
    </div>
  );
};

interface MediaViewerModalProps {
  isOpen: boolean;
  url: string;
  /** msgid of the message that was clicked — used to select the correct entry
   *  when the same URL appears in multiple messages. */
  sourceMsgId?: string;
  onClose: () => void;
  serverId?: string;
  channelId?: string;
}

export function MediaViewerModal({
  isOpen,
  url,
  sourceMsgId,
  onClose,
  serverId,
  channelId,
}: MediaViewerModalProps) {
  // zoom drives the slider/buttons UI; the actual image transform is applied
  // directly via imgRef to avoid React re-renders on every gesture event.
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [imageList, setImageList] = useState<string[]>([]);
  const [mediaEntries, setMediaEntries] = useState<
    { url: string; type: MediaType | null; msg: Message; entryKey: string }[]
  >([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const [showComments, setShowComments] = useState(false);
  // When the opened URL has no typed entry (extensionless filehost URL), probe it.
  // 'probing' = in flight, MediaType = resolved, 'failed' = no media found.
  const [probedType, setProbedType] = useState<
    MediaType | "probing" | "failed"
  >("probing");

  const isMobile = useMediaQuery();

  // Sources of truth for transform — written directly by gesture handlers,
  // never derived from React state, so renders can't fight them.
  const zoomRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    startTransX: number;
    startTransY: number;
  } | null>(null);
  // Prevents the mouseup click event from firing the zoom toggle after a drag gesture
  const hasDraggedRef = useRef(false);
  const lastPinchDistRef = useRef<number | null>(null);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const imageListRef = useRef(imageList);
  imageListRef.current = imageList;
  const singleTouchRef = useRef<{
    startX: number;
    startY: number;
    startTransX: number;
    startTransY: number;
  } | null>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const filmstripScrollRef = useRef<HTMLDivElement>(null);
  // useState + callback ref: effect re-runs when the filmstrip pill mounts/unmounts
  // (useRef + [] never re-ran after AppLayout moved the modal to always-mounted)
  const [filmstripPillEl, setFilmstripPillEl] = useState<HTMLDivElement | null>(
    null,
  );
  const filmstripPillRef = useCallback(
    (el: HTMLDivElement | null) => setFilmstripPillEl(el),
    [],
  );
  const prevValidIndexRef = useRef<number | undefined>(undefined);
  const nextValidIndexRef = useRef<number | undefined>(undefined);
  // Debounce timer: slider state update is deferred during high-frequency gestures
  const sliderDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(sliderDebounceRef.current);
  }, []);

  const currentUrl = currentIndex >= 0 ? imageList[currentIndex] : url;

  // Derived values for current entry type — kept in a ref so non-reactive handlers can read it
  const currentEntry = mediaEntries[currentIndex] ?? null;
  const currentEntryRef = useRef(currentEntry);
  currentEntryRef.current = currentEntry;

  // Derived values for comments sidebar
  const currentSourceMsg = mediaEntries[currentIndex]?.msg ?? null;
  const isAlbum =
    currentSourceMsg !== null &&
    mediaEntries.filter((e) => e.msg.id === currentSourceMsg.id).length > 1;
  const canShowComments = Boolean(
    serverId && channelId && currentSourceMsg?.msgid,
  );

  const { showSafeMedia, showTrustedSourcesMedia, showExternalContent } =
    useStore((state) => state.globalSettings);

  // Map of msgid → reply count, covers both the toolbar button and filmstrip thumbnails
  const commentCountByMsgid = useStore(
    useShallow((state) => {
      if (!serverId || !channelId) return {} as Record<string, number>;
      const key = `${serverId}-${channelId}`;
      const counts: Record<string, number> = {};
      for (const m of state.messages[key] ?? []) {
        const replyTo = m.tags?.["+draft/reply"]?.trim();
        if (replyTo) counts[replyTo] = (counts[replyTo] ?? 0) + 1;
      }
      return counts;
    }),
  );
  const commentCount = currentSourceMsg?.msgid
    ? (commentCountByMsgid[currentSourceMsg.msgid] ?? 0)
    : 0;

  // Apply transform directly to the DOM element — zero React re-renders during gestures.
  const applyTransform = useCallback((z: number, tx: number, ty: number) => {
    zoomRef.current = z;
    translateRef.current = { x: tx, y: ty };
    if (imgRef.current) {
      imgRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    }
  }, []);

  // Schedule a slider state update, coalescing rapid gesture events.
  const scheduleSliderUpdate = useCallback((z: number) => {
    clearTimeout(sliderDebounceRef.current);
    sliderDebounceRef.current = setTimeout(() => setZoom(z), 80);
  }, []);

  useEffect(() => {
    if (isOpen) {
      applyTransform(1, 0, 0);
      setZoom(1);
      setFailedUrls(new Set());
      setShowComments(false);
    }
  }, [isOpen, applyTransform]);

  // Build navigation index when lightbox opens
  useEffect(() => {
    if (!isOpen) return;
    if (!serverId || !channelId) {
      setMediaEntries([]);
      setImageList([]);
      setCurrentIndex(-1);
      return;
    }
    const messages = getChannelMessages(serverId, channelId);
    const filehost = useStore
      .getState()
      .servers.find((s) => s.id === serverId)?.filehost;
    const entries = messages
      .flatMap((msg) =>
        extractMediaFromMessage(msg).map((e, urlIdx) => ({
          url: e.url,
          type: e.type,
          msg,
          // Unique per (message, position-within-message) so duplicate URLs across
          // or within messages each get their own filmstrip slot.
          entryKey: `${msg.msgid ?? msg.id}:${urlIdx}`,
        })),
      )
      .filter(
        (e) =>
          // Include entries when:
          // 1. Type is known from trusted domain (e.type !== null).
          // 2. URL has a recognisable extension — entry has type:null now (HEAD probed)
          //    but extension suggests it's media; HEAD will confirm or deny at render time.
          // 3. Extensionless filehost URL — type resolved via HEAD probe.
          // 4. The specifically opened URL, regardless of domain — user already saw it
          //    in chat so canShowMedia is satisfied; we need it in the list for comments
          //    and filmstrip positioning (e.g. radio streams on a different subdomain).
          (e.type !== null ||
            detectMediaType(e.url) !== null ||
            (filehost != null && isUrlFromFilehost(e.url, filehost)) ||
            (e.url === url && (!sourceMsgId || e.msg.msgid === sourceMsgId))) &&
          canShowMedia(
            e.url,
            { showSafeMedia, showTrustedSourcesMedia, showExternalContent },
            filehost,
          ),
      );
    setMediaEntries(entries);
    setImageList(entries.map((e) => e.url));
    // Prefer matching by msgid+url so the correct entry is selected even when
    // the same URL appears in several messages.
    const idx = sourceMsgId
      ? entries.findIndex((e) => e.msg.msgid === sourceMsgId && e.url === url)
      : entries.findIndex((e) => e.url === url);
    setCurrentIndex(idx);
  }, [
    isOpen,
    serverId,
    channelId,
    url,
    sourceMsgId,
    showSafeMedia,
    showTrustedSourcesMedia,
    showExternalContent,
  ]);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      setZoom(1);
      applyTransform(1, 0, 0);
    },
    [applyTransform],
  );

  const addFailedUrl = useCallback((u: string) => {
    setFailedUrls((prev) => {
      const next = new Set(prev);
      next.add(u);
      return next;
    });
  }, []);

  useEffect(() => {
    thumbRefs.current[currentIndex]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [currentIndex]);

  // Probe the URL when it has no typed entry, or the entry's type is null
  // (extensionless filehost URLs like /radio that need a HEAD request to determine type).
  // On resolve, patch the type in mediaEntries so the filmstrip and comments update too.
  useEffect(() => {
    if (!isOpen || (currentEntry !== null && currentEntry.type !== null)) {
      setProbedType("probing");
      return;
    }
    let cancelled = false;
    setProbedType("probing");
    probeMediaUrl(currentUrl).then((result) => {
      if (!cancelled) {
        const resolved = result && !result.skipped ? result.type : null;
        setProbedType(resolved ?? "failed");
        if (resolved) {
          setMediaEntries((prev) =>
            prev.map((e) =>
              e.url === currentUrl && e.type === null
                ? { ...e, type: resolved }
                : e,
            ),
          );
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUrl, currentEntry]);

  // Convert wheel to horizontal scroll over the whole filmstrip pill (desktop).
  // filmstripPillEl comes from a callback ref so this effect runs exactly when the
  // element mounts (filmstrip is conditional on imageList.length > 1).
  useEffect(() => {
    if (!filmstripPillEl) return;
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (filmstripScrollRef.current) {
        filmstripScrollRef.current.scrollLeft += e.deltaX + e.deltaY;
      }
    };
    filmstripPillEl.addEventListener("wheel", onWheel, { passive: false });
    return () => filmstripPillEl.removeEventListener("wheel", onWheel);
  }, [filmstripPillEl]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: goTo only calls stable functions, not a hook dependency
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let the warning modal handle its own Escape; don't close the lightbox behind it
        if (showWarning) return;
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // Don't steal arrow keys from the zoom range input
        if ((e.target as Element).closest?.("input[type='range']")) return;
        if (e.key === "ArrowLeft" && prevValidIndexRef.current !== undefined)
          goTo(prevValidIndexRef.current);
        if (e.key === "ArrowRight" && nextValidIndexRef.current !== undefined)
          goTo(nextValidIndexRef.current);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, showWarning, currentIndex, imageList.length]);

  // Wheel zoom — applies transform directly, debounces slider state update
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !isOpen) return;
    const onWheel = (e: WheelEvent) => {
      // Only zoom for images
      if (
        currentEntryRef.current?.type &&
        currentEntryRef.current.type !== "image"
      )
        return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const next = clampZoom(zoomRef.current + delta);
      const tx = next <= 1 ? 0 : translateRef.current.x;
      const ty = next <= 1 ? 0 : translateRef.current.y;
      applyTransform(next, tx, ty);
      scheduleSliderUpdate(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isOpen, applyTransform, scheduleSliderUpdate]);

  // Pinch-to-zoom and swipe (non-passive touch)
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !isOpen) return;

    const pinchDist = (touches: TouchList): number => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      // toolbar touches and comment sidebar touches must not trigger swipe/pan
      if (
        (e.target as Element).closest?.("[data-no-gesture]") ||
        (e.target as Element).closest?.("[data-comments-sidebar]")
      ) {
        singleTouchRef.current = null;
        return;
      }
      if (e.touches.length === 2) {
        lastPinchDistRef.current = pinchDist(e.touches);
        singleTouchRef.current = null;
      } else if (e.touches.length === 1) {
        lastPinchDistRef.current = null;
        hasDraggedRef.current = false;
        singleTouchRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startTransX: translateRef.current.x,
          startTransY: translateRef.current.y,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
        // Only pinch-zoom for images
        if (
          currentEntryRef.current?.type &&
          currentEntryRef.current.type !== "image"
        )
          return;
        e.preventDefault();
        const dist = pinchDist(e.touches);
        const ratio = dist / lastPinchDistRef.current;
        const next = clampZoom(zoomRef.current * ratio);
        const tx = next <= 1 ? 0 : translateRef.current.x;
        const ty = next <= 1 ? 0 : translateRef.current.y;
        applyTransform(next, tx, ty);
        scheduleSliderUpdate(next);
        lastPinchDistRef.current = dist;
      } else if (e.touches.length === 1 && singleTouchRef.current !== null) {
        const dx = e.touches[0].clientX - singleTouchRef.current.startX;
        const dy = e.touches[0].clientY - singleTouchRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
        if (zoomRef.current > 1) {
          e.preventDefault();
          applyTransform(
            zoomRef.current,
            singleTouchRef.current.startTransX + dx,
            singleTouchRef.current.startTransY + dy,
          );
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      lastPinchDistRef.current = null;
      if (singleTouchRef.current !== null && zoomRef.current <= 1) {
        const dx =
          (e.changedTouches[0]?.clientX ?? 0) - singleTouchRef.current.startX;
        const SWIPE_THRESHOLD = 60;
        if (Math.abs(dx) > SWIPE_THRESHOLD && hasDraggedRef.current) {
          if (dx > 0 && prevValidIndexRef.current !== undefined) {
            goTo(prevValidIndexRef.current);
          } else if (dx < 0 && nextValidIndexRef.current !== undefined) {
            goTo(nextValidIndexRef.current);
          }
        }
      }
      singleTouchRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [isOpen, goTo, applyTransform, scheduleSliderUpdate]);

  // changeZoom: called by slider, +/- buttons — explicit user action, update immediately
  const changeZoom = useCallback(
    (newZoom: number) => {
      const clamped = clampZoom(newZoom);
      const tx = clamped <= 1 ? 0 : translateRef.current.x;
      const ty = clamped <= 1 ? 0 : translateRef.current.y;
      applyTransform(clamped, tx, ty);
      setZoom(clamped);
    },
    [applyTransform],
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag for images
    if (
      currentEntryRef.current?.type &&
      currentEntryRef.current.type !== "image"
    )
      return;
    if (zoomRef.current <= 1) return;
    // Don't start drag when clicking inside the comments sidebar
    if ((e.target as Element).closest?.("[data-comments-sidebar]")) return;
    e.preventDefault();
    e.stopPropagation();
    hasDraggedRef.current = false;
    setIsDragging(true);
    dragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startTransX: translateRef.current.x,
      startTransY: translateRef.current.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startMouseX;
    const dy = e.clientY - dragRef.current.startMouseY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
    applyTransform(
      zoomRef.current,
      dragRef.current.startTransX + dx,
      dragRef.current.startTransY + dy,
    );
  };

  const stopDrag = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    // Briefly enable CSS transition for the animated click-to-zoom, then remove it
    // so it doesn't interfere with drag/wheel/pinch.
    if (imgRef.current) {
      imgRef.current.style.transition = "transform 0.15s ease";
      setTimeout(() => {
        if (imgRef.current) imgRef.current.style.transition = "";
      }, 160);
    }
    changeZoom(zoomRef.current === 1 ? 2 : 1);
  };

  const handleCommentImageClick = useCallback(
    (imgUrl: string) => {
      let idx = mediaEntries.findIndex((e) => e.url === imgUrl);
      if (idx < 0 && serverId && channelId) {
        // Image might be from a comment posted after modal opened — rebuild index
        const filehost = useStore
          .getState()
          .servers.find((s) => s.id === serverId)?.filehost;
        const freshEntries = getChannelMessages(serverId, channelId)
          .flatMap((msg) =>
            extractMediaFromMessage(msg).map(
              (e: MediaEntry, urlIdx: number) => ({
                url: e.url,
                type: e.type,
                msg,
                entryKey: `${msg.msgid ?? msg.id}:${urlIdx}`,
              }),
            ),
          )
          .filter(
            (
              e,
            ): e is {
              url: string;
              type: MediaType;
              msg: Message;
              entryKey: string;
            } =>
              e.type !== null &&
              canShowMedia(
                e.url,
                { showSafeMedia, showTrustedSourcesMedia, showExternalContent },
                filehost,
              ),
          );
        idx = freshEntries.findIndex((e) => e.url === imgUrl);
        if (idx >= 0) {
          setMediaEntries(freshEntries);
          setImageList(freshEntries.map((e) => e.url));
        }
      }
      if (idx >= 0) goTo(idx);
    },
    [
      mediaEntries,
      serverId,
      channelId,
      goTo,
      showSafeMedia,
      showTrustedSourcesMedia,
      showExternalContent,
    ],
  );

  const handleConfirmOpen = async () => {
    await openExternalUrl(currentUrl);
    setShowWarning(false);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const msg = await invoke<string>("download_image", { url: currentUrl });
      if (msg) {
        setSavedMessage(msg);
        setTimeout(() => setSavedMessage(""), 4000);
      }
    } catch {
      console.error("Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  // Walk outward from currentIndex to find nearest non-failed neighbours
  let prevValidIndex: number | undefined;
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (!failedUrls.has(imageList[i])) {
      prevValidIndex = i;
      break;
    }
  }
  let nextValidIndex: number | undefined;
  for (let i = currentIndex + 1; i < imageList.length; i++) {
    if (!failedUrls.has(imageList[i])) {
      nextValidIndex = i;
      break;
    }
  }
  // Keep refs in sync so touch/swipe handlers can read them without re-registering
  prevValidIndexRef.current = prevValidIndex;
  nextValidIndexRef.current = nextValidIndex;

  const hasPrev = prevValidIndex !== undefined;
  const hasNext = nextValidIndex !== undefined;
  const cursor = isDragging ? "grabbing" : zoom > 1 ? "zoom-out" : "zoom-in";
  const portalTarget = document.getElementById("root") ?? document.body;

  // When currentEntry has type: null (extension-based URL), use URL extension as an optimistic
  // hint while the HEAD probe is in flight so the UI renders immediately. The probe result
  // takes over once it resolves, allowing the server's Content-Type to correct wrong guesses.
  const effectiveType: MediaType | null =
    currentEntry?.type ??
    (probedType === "probing"
      ? detectMediaType(currentUrl) // optimistic hint from URL extension while probing
      : probedType === "failed"
        ? null
        : probedType);
  // Only show the spinner when both the probe is still in flight AND the URL extension gives
  // no hint — i.e., we truly don't know the type yet.
  const isViewerProbing =
    (currentEntry === null || currentEntry.type === null) &&
    probedType === "probing" &&
    detectMediaType(currentUrl) === null;
  // Treat as image only when we know it's an image — never fall back for unknown types
  // (avoids feeding stream URLs into <img> which hangs the browser).
  const isImageEntry = effectiveType === "image";

  // Only offer download for definite files — not embeds, PDFs, or live audio streams.
  // Audio is downloadable only when the URL has a recognised extension (streams don't).
  const isDownloadable = (() => {
    const t = effectiveType;
    if (!t || t === "embed") return false;
    if (t === "image" || t === "video" || t === "pdf") return true;
    if (t === "audio") {
      try {
        return /\.(mp3|ogg|wav|flac|aac|m4a|opus)$/i.test(
          new URL(currentUrl).pathname,
        );
      } catch {
        return false;
      }
    }
    return false;
  })();

  return createPortal(
    <>
      <ExternalLinkWarningModal
        isOpen={showWarning}
        url={currentUrl}
        onConfirm={handleConfirmOpen}
        onCancel={() => setShowWarning(false)}
      />

      <div
        ref={overlayRef}
        data-lightbox-overlay=""
        className="fixed inset-0 z-[9998] [overflow:clip] animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Background layers are direct children of fixed div — immune to flex layout timing */}
        <div
          aria-hidden="true"
          style={{
            // Only use the URL as background for images — feeding streams or videos
            // into backgroundImage causes the browser to attempt an image fetch.
            backgroundImage: isImageEntry ? `url(${currentUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: "black",
            filter: "blur(40px) brightness(0.3) saturate(1.4)",
            transform: "scale(1.12)",
          }}
          className="absolute inset-0"
        />
        <div className="absolute inset-0 bg-black/25" aria-hidden="true" />

        <div className="absolute inset-0 flex">
          {/* LEFT: image area — hidden on mobile when sidebar is open */}
          <div
            className={`relative flex-1 min-w-0 overflow-hidden ${showComments && isMobile ? "hidden" : ""}`}
          >
            {/* Click-to-close covers only the image area, not the sidebar */}
            <div
              className="absolute inset-0"
              onClick={onClose}
              aria-hidden="true"
            />

            {/* Top bar: controls centered, close on the right */}
            <div
              data-no-gesture=""
              className="absolute top-0 left-0 right-0 z-10 flex items-center px-4 pointer-events-none"
              style={{
                paddingTop: "calc(0.75rem + var(--safe-area-inset-top, 0px))",
                paddingBottom: "0.75rem",
              }}
            >
              {/* Spacer mirrors close button to keep pill truly centered */}
              <div className="w-10 flex-shrink-0" />

              <div className="flex-1 flex justify-center">
                <div
                  data-no-gesture=""
                  className="pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-xl rounded-2xl px-4 py-2 shadow-2xl text-white/90"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Zoom controls — images only */}
                  {isImageEntry && (
                    <>
                      <button
                        type="button"
                        onClick={() => changeZoom(zoom - ZOOM_STEP)}
                        disabled={zoom <= ZOOM_MIN}
                        aria-label="Zoom out"
                        className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <FaMinus className="w-3 h-3" />
                      </button>

                      <input
                        type="range"
                        min={ZOOM_MIN}
                        max={ZOOM_MAX}
                        step={ZOOM_STEP}
                        value={zoom}
                        onChange={(e) => changeZoom(Number(e.target.value))}
                        aria-label="Zoom level"
                        className="hidden sm:block w-28 cursor-pointer accent-white"
                      />

                      <button
                        type="button"
                        onClick={() => changeZoom(zoom + ZOOM_STEP)}
                        disabled={zoom >= ZOOM_MAX}
                        aria-label="Zoom in"
                        className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <FaPlus className="w-3 h-3" />
                      </button>
                    </>
                  )}

                  {isTauri() && isDownloadable && (
                    <>
                      {isImageEntry && (
                        <div
                          className="w-px h-4 bg-white/20 mx-1"
                          aria-hidden="true"
                        />
                      )}
                      <button
                        type="button"
                        onClick={handleDownload}
                        disabled={isDownloading}
                        title="Download"
                        aria-label="Download"
                        className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {isDownloading ? (
                          <FaSpinner className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FaDownload className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowWarning(true)}
                    title="Open in browser"
                    aria-label="Open in browser"
                    className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <FaExternalLinkAlt className="w-3.5 h-3.5" />
                  </button>

                  {canShowComments && (
                    <>
                      <div
                        className="w-px h-4 bg-white/20 mx-1"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => setShowComments((v) => !v)}
                        title={
                          commentCount > 0
                            ? `Comments (${commentCount})`
                            : "Comments"
                        }
                        aria-label={
                          showComments
                            ? "Hide comments"
                            : `Show comments${commentCount > 0 ? ` (${commentCount})` : ""}`
                        }
                        aria-pressed={showComments}
                        className={`relative p-1.5 rounded-full transition-colors ${
                          showComments
                            ? "bg-white/20 text-white"
                            : commentCount > 0
                              ? "hover:bg-white/10 text-white"
                              : "hover:bg-white/10 text-white/70 hover:text-white"
                        }`}
                      >
                        <FaComments className="w-4 h-4" />
                        {commentCount > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none pointer-events-none">
                            {commentCount > 99 ? "99+" : commentCount}
                          </span>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors backdrop-blur-sm flex-shrink-0"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Saved message toast below top bar */}
            {savedMessage && (
              <p className="absolute top-20 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap text-xs text-white/80 bg-black/60 rounded-lg px-3 py-1 pointer-events-none animate-in fade-in duration-150">
                {savedMessage}
              </p>
            )}

            {/* Main media area */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                paddingTop: "calc(4rem + var(--safe-area-inset-top, 0px))",
                paddingBottom:
                  imageList.length > 1
                    ? "calc(5.5rem + var(--safe-area-inset-bottom, 0px))"
                    : "1rem",
              }}
            >
              {/* Loading spinner — while probing an extensionless URL */}
              {isViewerProbing && (
                <div className="flex flex-col items-center gap-3 text-discord-text-muted pointer-events-none">
                  <FaSpinner className="animate-spin text-4xl" />
                  <span className="text-sm">Loading…</span>
                </div>
              )}
              {/* Image */}
              {isImageEntry && (
                <img
                  ref={imgRef}
                  src={currentUrl}
                  alt="Image preview"
                  draggable={false}
                  className="select-none pointer-events-auto transparency-grid"
                  style={{
                    maxWidth: "calc(100% - 4rem)",
                    maxHeight: "calc(100vh - 10rem)",
                    transformOrigin: "center",
                    cursor,
                    borderRadius: "4px",
                  }}
                  onMouseDown={handleMouseDown}
                  onClick={handleImageClick}
                />
              )}
              {/* Video */}
              {effectiveType === "video" && (
                // biome-ignore lint/a11y/useMediaCaption: user-linked IRC media, no captions available
                <video
                  src={currentUrl}
                  controls
                  className="max-h-full max-w-full rounded pointer-events-auto select-none"
                  style={{
                    maxWidth: "calc(100% - 4rem)",
                    maxHeight: "calc(100vh - 10rem)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              {/* Audio */}
              {effectiveType === "audio" && (
                <AudioViewerPlayer key={currentUrl} url={currentUrl} />
              )}
              {/* PDF */}
              {effectiveType === "pdf" && (
                <div
                  className="pointer-events-auto overflow-auto"
                  style={{ maxHeight: "calc(100vh - 10rem)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Suspense
                    fallback={
                      <div className="w-48 h-64 bg-discord-dark-400/50 animate-pulse rounded" />
                    }
                  >
                    <LazyDocument file={currentUrl}>
                      <LazyPage
                        pageNumber={1}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </LazyDocument>
                  </Suspense>
                </div>
              )}
              {/* Embed (YouTube, Vimeo, etc.) */}
              {effectiveType === "embed" && (
                <div
                  className="pointer-events-auto w-full h-full flex items-center justify-center"
                  style={{
                    maxWidth: "calc(100% - 4rem)",
                    maxHeight: "calc(100vh - 10rem)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Suspense
                    fallback={
                      <div className="w-full h-64 bg-discord-dark-400/50 animate-pulse rounded" />
                    }
                  >
                    <ReactPlayer
                      src={currentUrl}
                      width="100%"
                      height="100%"
                      controls
                    />
                  </Suspense>
                </div>
              )}
            </div>

            {/* Bottom filmstrip — only when there are multiple media items */}
            {imageList.length > 1 && (
              <div
                data-no-gesture=""
                className="absolute bottom-0 left-0 right-0 z-10 flex justify-center pointer-events-none"
                style={{
                  paddingBottom:
                    "calc(1rem + var(--safe-area-inset-bottom, 0px))",
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <div
                  ref={filmstripPillRef}
                  className="pointer-events-auto flex items-center gap-1 bg-black/60 backdrop-blur-xl rounded-2xl px-2 py-2 shadow-2xl"
                  style={{ maxWidth: "min(24rem, calc(100vw - 2rem))" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* invisible when !hasPrev to preserve layout */}
                  <button
                    type="button"
                    aria-label="Previous image"
                    onClick={() =>
                      prevValidIndex !== undefined && goTo(prevValidIndex)
                    }
                    disabled={!hasPrev}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-white/60
                               hover:text-white hover:bg-white/10 transition-all
                               disabled:opacity-0 disabled:pointer-events-none flex-shrink-0"
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>

                  {/* Scrollable thumbnail row */}
                  <div
                    ref={filmstripScrollRef}
                    className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto px-1 py-0.5"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {imageList.map((thumbUrl, thumbIndex) => {
                      if (failedUrls.has(thumbUrl)) return null;
                      const entry = mediaEntries[thumbIndex];
                      return (
                        <button
                          key={mediaEntries[thumbIndex]?.entryKey ?? thumbUrl}
                          ref={(el) => {
                            thumbRefs.current[thumbIndex] = el;
                          }}
                          type="button"
                          aria-label={`Image ${thumbIndex + 1} of ${imageList.length}`}
                          aria-current={
                            thumbIndex === currentIndex ? "true" : undefined
                          }
                          onClick={() => goTo(thumbIndex)}
                          className={`relative rounded-lg overflow-hidden flex-shrink-0 transition-opacity duration-150 ${
                            thumbIndex === currentIndex
                              ? "w-14 h-14 ring-2 ring-white ring-offset-1 ring-offset-transparent opacity-100"
                              : "w-11 h-11 opacity-50 hover:opacity-80"
                          }`}
                        >
                          {entry?.type === "image" && (
                            <img
                              src={thumbUrl}
                              alt=""
                              draggable={false}
                              className="w-full h-full object-cover transparency-grid"
                              onError={() => addFailedUrl(thumbUrl)}
                            />
                          )}
                          {entry?.type === null && (
                            <div className="w-full h-full flex items-center justify-center bg-discord-dark-600">
                              <FaMusic className="text-white/60 text-lg" />
                            </div>
                          )}
                          {entry?.type === "video" && (
                            <div className="w-full h-full flex items-center justify-center bg-discord-dark-600">
                              <FaVideo className="text-white/60 text-lg" />
                            </div>
                          )}
                          {entry?.type === "audio" && (
                            <div className="w-full h-full flex items-center justify-center bg-discord-dark-600">
                              <FaMusic className="text-white/60 text-lg" />
                            </div>
                          )}
                          {entry?.type === "pdf" && (
                            <div className="w-full h-full flex items-center justify-center bg-discord-dark-600 text-white/60 text-xs font-bold">
                              PDF
                            </div>
                          )}
                          {entry?.type === "embed" &&
                            (() => {
                              const yt = getEmbedThumbnailUrl(entry.url);
                              if (yt) {
                                return (
                                  <img
                                    src={yt}
                                    alt=""
                                    draggable={false}
                                    className="w-full h-full object-cover"
                                    onError={() => addFailedUrl(thumbUrl)}
                                  />
                                );
                              }
                              return (
                                <div className="w-full h-full flex items-center justify-center bg-discord-dark-600">
                                  <FaVideo className="text-white/60 text-lg" />
                                </div>
                              );
                            })()}
                          {(() => {
                            const msgid = mediaEntries[thumbIndex]?.msg?.msgid;
                            const count = msgid
                              ? (commentCountByMsgid[msgid] ?? 0)
                              : 0;
                            if (!count) return null;
                            return (
                              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none pointer-events-none">
                                {count > 99 ? "99+" : count}
                              </span>
                            );
                          })()}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    aria-label="Next image"
                    onClick={() =>
                      nextValidIndex !== undefined && goTo(nextValidIndex)
                    }
                    disabled={!hasNext}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-white/60
                               hover:text-white hover:bg-white/10 transition-all
                               disabled:opacity-0 disabled:pointer-events-none flex-shrink-0"
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop sidebar — inline beside image */}
          {showComments &&
            canShowComments &&
            !isMobile &&
            currentSourceMsg &&
            serverId &&
            channelId && (
              <ResizableSidebar
                side="right"
                isVisible={true}
                defaultWidth={320}
                minWidth={240}
                maxWidth={Math.floor(window.innerWidth / 2)}
                bypass={false}
              >
                <MediaCommentsSidebar
                  sourceMessage={currentSourceMsg}
                  currentImageUrl={currentUrl}
                  serverId={serverId}
                  channelId={channelId}
                  isAlbum={isAlbum}
                  isMobile={false}
                  onClose={() => setShowComments(false)}
                  onCloseAll={onClose}
                  onImageClick={handleCommentImageClick}
                />
              </ResizableSidebar>
            )}

          {/* Mobile sidebar — full-screen overlay */}
          {showComments &&
            canShowComments &&
            isMobile &&
            currentSourceMsg &&
            serverId &&
            channelId && (
              <div className="absolute inset-0 z-20">
                <MediaCommentsSidebar
                  sourceMessage={currentSourceMsg}
                  currentImageUrl={currentUrl}
                  serverId={serverId}
                  channelId={channelId}
                  isAlbum={isAlbum}
                  isMobile={true}
                  onClose={() => setShowComments(false)}
                  onCloseAll={onClose}
                  onImageClick={handleCommentImageClick}
                />
              </div>
            )}
        </div>
      </div>
    </>,
    portalTarget,
  );
}
