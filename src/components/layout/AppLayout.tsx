import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import useStore from "../../store";
import { ChannelList } from "./ChannelList";
import { ChatArea } from "./ChatArea";
import { MemberList } from "./MemberList";
import { ServerList } from "./ServerList";

// Constants for member list sizing
const MIN_MEMBER_LIST_WIDTH = 80;
const MAX_MEMBER_LIST_WIDTH = 400;
const DEFAULT_MEMBER_LIST_WIDTH = 240;

export const AppLayout: React.FC = () => {
  const {
    ui: { isDarkMode, isMobileMenuOpen, isMemberListVisible },
    toggleMobileMenu,
    toggleMemberList,
  } = useStore();
  // Member list width state
  const [memberListWidth, setMemberListWidth] = useState(
    DEFAULT_MEMBER_LIST_WIDTH,
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = memberListWidth;
    },
    [memberListWidth],
  );

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = resizeStartX.current - e.clientX;
      const newWidth = Math.min(
        Math.max(resizeStartWidth.current + deltaX, MIN_MEMBER_LIST_WIDTH),
        MAX_MEMBER_LIST_WIDTH,
      );
      if (newWidth === MIN_MEMBER_LIST_WIDTH) toggleMemberList(false);
      setMemberListWidth(newWidth);
    },
    [isResizing, toggleMemberList],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add resize event listeners
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

  // Set theme class on body
  useEffect(() => {
    document.body.classList.toggle("dark", isDarkMode);
    document.body.classList.toggle("light", !isDarkMode);

    // Set data-theme for daisyUI
    document.documentElement.setAttribute("data-theme", "discord");

    // Set background color
    document.body.style.backgroundColor = isDarkMode ? "#202225" : "#ffffff";
  }, [isDarkMode]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isMobileMenuOpen) {
        const target = e.target as HTMLElement;
        if (
          !target.closest(".server-list") &&
          !target.closest(".channel-list")
        ) {
          toggleMobileMenu(false);
        }
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isMobileMenuOpen, toggleMobileMenu]);

  return (
    <div
      className={`flex h-screen overflow-hidden bg-discord-dark-300 ${isDarkMode ? "text-white" : "text-gray-900"}`}
    >
      {/* Server list - leftmost sidebar */}
      <div className="server-list flex-shrink-0 w-[72px] h-full bg-discord-dark-300 z-30">
        <ServerList />
      </div>

      {/* Channel list - left sidebar */}
      <div
        className={`channel-list flex-shrink-0 w-60 h-full bg-discord-dark-100
          ${isMobileMenuOpen ? "block" : "hidden"} md:block z-20`}
      >
        <ChannelList />
      </div>

      {/* Main content area - Chat */}
      <div className="flex-grow h-full bg-discord-dark-200 flex flex-col min-w-0 z-10">
        <ChatArea />
      </div>

      {/* Member list - right sidebar */}
      <div
        className={`member-list flex-shrink-0 h-full bg-discord-dark-600 hidden md:flex flex-col relative
          ${!isMemberListVisible ? "w-0" : ""}`}
        style={{ width: isMemberListVisible ? `${memberListWidth}px` : "0" }}
      >
        {/* Resize handle */}
        <div
          className={`absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-discord-dark-100 transition-colors
            ${!isMemberListVisible ? "hidden" : ""}`}
          onMouseDown={handleResizeStart}
        />
        {/* Member list content */}
        <div className="flex-1 overflow-hidden">
          <MemberList />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
