import { XMarkIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaExternalLinkAlt, FaMinus, FaPlus } from "react-icons/fa";
import { openExternalUrl } from "../../lib/openUrl";
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
}

export function ImageLightboxModal({
  isOpen,
  url,
  onClose,
}: ImageLightboxModalProps) {
  const [zoom, setZoom] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const dragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    startTransX: number;
    startTransY: number;
  } | null>(null);
  // Prevents the mouseup click event from firing the zoom toggle after a drag gesture
  const hasDraggedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

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
    await openExternalUrl(url);
    setShowWarning(false);
  };

  if (!isOpen) return null;

  const cursor = isDragging ? "grabbing" : zoom > 1 ? "zoom-out" : "zoom-in";
  const portalTarget = document.getElementById("root") ?? document.body;

  return createPortal(
    <>
      <ExternalLinkWarningModal
        isOpen={showWarning}
        url={url}
        onConfirm={handleConfirmOpen}
        onCancel={() => setShowWarning(false)}
      />

      <div
        className="fixed inset-0 z-[9998] overflow-hidden animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
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
          className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors backdrop-blur-sm"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-20">
          <img
            src={url}
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
              onClick={() => setShowWarning(true)}
              title="Open in browser"
              aria-label="Open in browser"
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <FaExternalLinkAlt className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>,
    portalTarget,
  );
}
