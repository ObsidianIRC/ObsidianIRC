import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaDownload,
  FaExternalLinkAlt,
  FaMinus,
  FaPlus,
  FaSpinner,
} from "react-icons/fa";
import { extractImageUrlsFromMessage } from "../../lib/imageUtils";
import { openExternalUrl } from "../../lib/openUrl";
import { isTauri } from "../../lib/platformUtils";
import { getChannelMessages } from "../../store";
import ExternalLinkWarningModal from "./ExternalLinkWarningModal";

const ZOOM_STEP = 0.25;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

interface ImageLightboxModalProps {
  isOpen: boolean;
  url: string;
  onClose: () => void;
  serverId?: string;
  channelId?: string;
}

export function ImageLightboxModal({
  isOpen,
  url,
  onClose,
  serverId,
  channelId,
}: ImageLightboxModalProps) {
  // zoom drives the slider/buttons UI; the actual image transform is applied
  // directly via imgRef to avoid React re-renders on every gesture event.
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

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
  const filmstripPillRef = useRef<HTMLDivElement>(null);
  const prevValidIndexRef = useRef<number | undefined>(undefined);
  const nextValidIndexRef = useRef<number | undefined>(undefined);
  // Debounce timer: slider state update is deferred during high-frequency gestures
  const sliderDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const currentUrl = currentIndex >= 0 ? imageList[currentIndex] : url;

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
    }
  }, [isOpen, applyTransform]);

  // Build navigation index when lightbox opens
  useEffect(() => {
    if (!isOpen || !serverId || !channelId) return;
    const messages = getChannelMessages(serverId, channelId);
    const urls = messages.flatMap(extractImageUrlsFromMessage);
    setImageList(urls);
    const idx = urls.indexOf(url);
    setCurrentIndex(idx);
  }, [isOpen, serverId, channelId, url]);

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

  // Convert wheel to horizontal scroll over the whole filmstrip pill (desktop).
  // Depends on imageList.length so it re-attaches once the filmstrip is rendered.
  // Listener on the pill so prev/next buttons also intercept, not just the scroll div.
  useEffect(() => {
    const el = filmstripPillRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (filmstripScrollRef.current) {
        filmstripScrollRef.current.scrollLeft += e.deltaX + e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
      // toolbar touches bubble to overlayRef and would trip swipe/pan tracking
      if ((e.target as Element).closest?.("[data-no-gesture]")) {
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
    if (zoomRef.current <= 1) return;
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
        className="fixed inset-0 z-[9998] overflow-hidden animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden="true"
          style={{
            backgroundImage: `url(${currentUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(40px) brightness(0.15) saturate(1.4)",
            transform: "scale(1.12)",
          }}
          className="absolute inset-0"
        />
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
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

              {isTauri() && (
                <>
                  <div
                    className="w-px h-4 bg-white/20 mx-1"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    title="Download image"
                    aria-label="Download image"
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

        {/* Main image area */}
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
          <img
            ref={imgRef}
            src={currentUrl}
            alt="Image preview"
            draggable={false}
            className="object-contain select-none pointer-events-auto"
            style={{
              maxWidth: "calc(100vw - 4rem)",
              maxHeight: "calc(100vh - 10rem)",
              transformOrigin: "center",
              cursor,
            }}
            onMouseDown={handleMouseDown}
            onClick={handleImageClick}
          />
        </div>

        {/* Bottom filmstrip — only when there are multiple images */}
        {imageList.length > 1 && (
          <div
            data-no-gesture=""
            className="absolute bottom-0 left-0 right-0 z-10 flex justify-center pointer-events-none"
            style={{
              paddingBottom: "calc(1rem + var(--safe-area-inset-bottom, 0px))",
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
                  return (
                    <button
                      key={thumbUrl}
                      ref={(el) => {
                        thumbRefs.current[thumbIndex] = el;
                      }}
                      type="button"
                      aria-label={`Image ${thumbIndex + 1} of ${imageList.length}`}
                      aria-current={
                        thumbIndex === currentIndex ? "true" : undefined
                      }
                      onClick={() => goTo(thumbIndex)}
                      className={`rounded-lg overflow-hidden flex-shrink-0 transition-opacity duration-150 ${
                        thumbIndex === currentIndex
                          ? "w-14 h-14 ring-2 ring-white ring-offset-1 ring-offset-transparent opacity-100"
                          : "w-11 h-11 opacity-50 hover:opacity-80"
                      }`}
                    >
                      <img
                        src={thumbUrl}
                        alt=""
                        draggable={false}
                        className="w-full h-full object-cover"
                        onError={() => addFailedUrl(thumbUrl)}
                      />
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
    </>,
    portalTarget,
  );
}
