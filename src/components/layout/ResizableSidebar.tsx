import type React from "react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface ResizableSidebarProps {
  children: ReactNode;
  isVisible: boolean;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  side: "left" | "right";
  handleColor?: string;
  handleHoverColor?: string;
  bypass: boolean;
  onMinReached?: () => void;
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  children,
  isVisible,
  defaultWidth,
  minWidth,
  maxWidth,
  side,
  handleColor = "bg-discord-dark-200",
  handleHoverColor = "bg-discord-dark-400",
  onMinReached,
  bypass,
}) => {
  if (bypass) {
    return children;
  }

  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const wasVisible = useRef(isVisible);

  // If we are toggling visibility back on, reset the width
  useEffect(() => {
    if (isVisible && !wasVisible.current) {
      setWidth(defaultWidth);
    }
    wasVisible.current = isVisible;
  }, [isVisible, defaultWidth]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = width;
      e.preventDefault();
      e.stopPropagation();
    },
    [width],
  );

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = resizeStartX.current - e.clientX;
      const newWidth = Math.min(
        Math.max(
          resizeStartWidth.current + (side === "left" ? -deltaX : deltaX),
          minWidth,
        ),
        maxWidth,
      );
      if (newWidth <= minWidth && onMinReached) {
        onMinReached();
      }
      setWidth(newWidth);
      e.preventDefault();
      e.stopPropagation();
    },
    [isResizing, minWidth, maxWidth, side, onMinReached],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", handleResizeEnd);
      return () => {
        document.removeEventListener("mousemove", handleResize);
        document.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [isResizing, handleResize, handleResizeEnd]);

  const handleStyle =
    side === "left" ? "right-0 cursor-col-resize" : "left-0 cursor-col-resize";

  return (
    <div
      className="flex-shrink-0 h-full flex flex-col relative z-20"
      data-testid="resizable-sidebar"
      style={{
        width: isVisible ? `${width}px` : "0",
        display: isVisible ? "flex" : "none",
      }}
    >
      {/* Resize handle */}
      <div
        className={`absolute top-0 w-1 h-full transition-colors group ${handleStyle} ${
          !isVisible ? "hidden" : ""
        } hover:shadow-[0_0_5px_rgba(0,0,0,0.4)] ${side === "left" ? "hover:shadow-[4px_0_4px_-1px_rgba(0,0,0,0.3)]" : "hover:shadow-[-4px_0_4px_-1px_rgba(0,0,0,0.3)]"}`}
        onMouseDown={handleResizeStart}
        data-testid="resize-handle"
      >
        <div
          className={`absolute ${side === "left" ? "right-0" : "left-0"} w-[1px] h-full ${handleColor} group-hover:${handleHoverColor} ${isResizing ? handleHoverColor : ""}`}
        />
      </div>
      {/* Content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
};
