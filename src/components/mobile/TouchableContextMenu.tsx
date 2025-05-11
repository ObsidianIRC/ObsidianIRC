import type React from "react";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  className?: string;
}

interface TouchableContextMenuProps {
  children: ReactNode;
  menuItems: ContextMenuItem[];
  onContextMenu?: (e: React.MouseEvent) => void;
  longPressDelay?: number;
  className?: string;
}

const TouchableContextMenu: React.FC<TouchableContextMenuProps> = ({
  children,
  menuItems,
  onContextMenu,
  longPressDelay = 200,
  className = "",
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
    onContextMenu?.(e);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: touch.clientX, y: touch.clientY });
    }, longPressDelay);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  const closeContextMenu = () => setContextMenu(null);

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
      >
        {children}
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={closeContextMenu} />
          <div
            className="fixed z-20 bg-discord-dark-500 rounded shadow-lg py-1 w-48"
            style={{
              right: containerRef.current
                ? `${Math.max(16, window.innerWidth - containerRef.current.getBoundingClientRect().right)}px`
                : "16px",
              top: containerRef.current
                ? `${Math.min(containerRef.current.getBoundingClientRect().bottom + 4, window.innerHeight - 90)}px`
                : "auto",
            }}
          >
            {menuItems.map((item) => (
              <button
                key={item.label}
                className={`w-full text-left px-3 py-2 hover:bg-discord-dark-400 flex items-center gap-2 ${item.className || ""}`}
                onClick={() => {
                  item.onClick();
                  closeContextMenu();
                }}
              >
                {item.icon && <span>{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
};

export default TouchableContextMenu;
