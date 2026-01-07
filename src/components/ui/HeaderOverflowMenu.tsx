import type React from "react";
import { type ReactNode, useEffect, useRef } from "react";

export interface HeaderOverflowMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  show: boolean;
}

interface HeaderOverflowMenuProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: HeaderOverflowMenuItem[];
  anchorElement: HTMLElement | null;
}

export const HeaderOverflowMenu: React.FC<HeaderOverflowMenuProps> = ({
  isOpen,
  onClose,
  menuItems,
  anchorElement,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorElement) return null;

  // Calculate menu position based on anchor element
  const rect = anchorElement.getBoundingClientRect();
  const menuWidth = 200;
  const menuHeight = menuItems.length * 40 + 8; // Approximate height (40px per item + padding)

  // Position menu below and aligned to right edge of button
  // Adjust to prevent going off-screen
  const x = rect.right - menuWidth;
  const y = rect.bottom + 4;

  const adjustedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

  const handleMenuItemClick = (onClick: () => void) => {
    onClick();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[100000] bg-discord-dark-300 border border-discord-dark-500 rounded-md shadow-xl w-[200px] animate-in fade-in duration-100"
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
    >
      <div className="py-1">
        {menuItems.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            onClick={() => handleMenuItemClick(item.onClick)}
            className="w-full px-3 py-2 text-left text-discord-text-normal hover:bg-discord-dark-200 hover:text-white transition-colors duration-150 flex items-center gap-2"
            title={item.label}
          >
            <span className="flex-shrink-0 text-sm">{item.icon}</span>
            <span className="text-sm">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default HeaderOverflowMenu;
