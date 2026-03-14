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
  const [zoom, setZoom] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const dragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    startTransX: number;
    startTransY: number;
  } | null>(null);
  // Prevents the mouseup click event from firing the zoom toggle after a drag gesture
  const hasDraggedRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lastPinchDistRef = useRef<number | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const translateRef = useRef(translate);
  translateRef.current = translate;
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

  const currentUrl = currentIndex >= 0 ? imageList[currentIndex] : url;

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Build navigation index when lightbox opens
  useEffect(() => {
    if (!isOpen || !serverId || !channelId) return;
    const messages = getChannelMessages(serverId, channelId);
    const urls = messages.flatMap(extractImageUrlsFromMessage);
    setImageList(urls);
    const idx = urls.indexOf(url);
    setCurrentIndex(idx);
  }, [isOpen, serverId, channelId, url]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setZoom(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: goTo only calls stable setState functions, not a hook dependency
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        goTo(currentIndex - 1);
      } else if (
        e.key === "ArrowRight" &&
        currentIndex < imageList.length - 1
      ) {
        goTo(currentIndex + 1);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, currentIndex, imageList.length]);

  // Wheel zoom (non-passive)
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !isOpen) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom((prev) => {
        const next = clampZoom(prev + delta);
        if (next <= 1) setTranslate({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isOpen]);

  // Pinch-to-zoom (non-passive touch)
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
        setZoom((prev) => {
          const next = clampZoom(prev * ratio);
          if (next <= 1) setTranslate({ x: 0, y: 0 });
          return next;
        });
        lastPinchDistRef.current = dist;
      } else if (e.touches.length === 1 && singleTouchRef.current !== null) {
        const dx = e.touches[0].clientX - singleTouchRef.current.startX;
        const dy = e.touches[0].clientY - singleTouchRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;
        if (zoomRef.current > 1) {
          e.preventDefault();
          setTranslate({
            x: singleTouchRef.current.startTransX + dx,
            y: singleTouchRef.current.startTransY + dy,
          });
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
          if (dx > 0 && currentIndexRef.current > 0) {
            goTo(currentIndexRef.current - 1);
          } else if (
            dx < 0 &&
            currentIndexRef.current < imageListRef.current.length - 1
          ) {
            goTo(currentIndexRef.current + 1);
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
  }, [isOpen, goTo]);

  const changeZoom = (newZoom: number) => {
    const clamped = clampZoom(newZoom);
    setZoom(clamped);
    if (clamped <= 1) setTranslate({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    hasDraggedRef.current = false;
    setIsDragging(true);
    dragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startTransX: translate.x,
      startTransY: translate.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startMouseX;
    const dy = e.clientY - dragRef.current.startMouseY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDraggedRef.current = true;
    }
    setTranslate({
      x: dragRef.current.startTransX + dx,
      y: dragRef.current.startTransY + dy,
    });
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
    changeZoom(zoom === 1 ? 2 : 1);
  };

  const handleConfirmOpen = async () => {
    await openExternalUrl(currentUrl);
    setShowWarning(false);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const msg = await invoke<string>("download_image", { url: currentUrl });
        if (msg) {
          setSavedMessage(msg);
          setTimeout(() => setSavedMessage(""), 4000);
        }
      } else {
        // CORS blocks fetch() on cross-origin images; <img> display is exempt
        window.open(currentUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < imageList.length - 1;
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
            backgroundImage: `url(${url})`,
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

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 z-10 w-12 h-12 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors backdrop-blur-sm"
          style={{ top: "calc(1rem + var(--safe-area-inset-top, 0px))" }}
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        {hasPrev && (
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => goTo(currentIndex - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 mb-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors backdrop-blur-sm z-10"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
        )}

        {hasNext && (
          <button
            type="button"
            aria-label="Next image"
            onClick={() => goTo(currentIndex + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 mb-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors backdrop-blur-sm z-10"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        )}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-20">
          <img
            src={currentUrl}
            alt="Image preview"
            draggable={false}
            className={`object-contain select-none pointer-events-auto ${
              isDragging ? "" : "transition-transform duration-150"
            }`}
            style={{
              maxWidth: "calc(100vw - 4rem)",
              maxHeight: "calc(100vh - 10rem)",
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`,
              transformOrigin: "center",
              cursor,
            }}
            onMouseDown={handleMouseDown}
            onClick={handleImageClick}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-5 pointer-events-none">
          <div
            data-no-gesture=""
            className="pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-xl rounded-2xl px-4 py-2.5 shadow-2xl text-white/90"
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
              className="w-28 cursor-pointer accent-white"
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

            <div className="w-px h-4 bg-white/20 mx-1" aria-hidden="true" />

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

          {savedMessage && (
            <p className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-white/80 bg-black/60 rounded-lg px-3 py-1 pointer-events-none animate-in fade-in duration-150">
              {savedMessage}
            </p>
          )}
        </div>
      </div>
    </>,
    portalTarget,
  );
}
