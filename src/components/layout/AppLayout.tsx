import type React from "react";
import { useEffect } from "react";
import useStore from "../../store";
import { ChannelList } from "./ChannelList";
import { ChatArea } from "./ChatArea";
import { MemberList } from "./MemberList";
import { ResizableSidebar } from "./ResizableSidebar";
import { ServerList } from "./ServerList";

export const AppLayout: React.FC = () => {
  const {
    ui: {
      isDarkMode,
      isMobileMenuOpen,
      isMemberListVisible,
      isChannelListVisible,
    },
    toggleMobileMenu,
    toggleMemberList,
    toggleChannelList,
  } = useStore();

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
      className={`flex h-screen overflow-hidden bg-discord-dark-300 ${
        isDarkMode ? "text-white" : "text-gray-900"
      }`}
    >
      {/* Server list - leftmost sidebar */}
      <div className="server-list flex-shrink-0 w-[72px] h-full bg-discord-dark-300 z-30">
        <ServerList />
      </div>

      <ResizableSidebar
        isVisible={isChannelListVisible}
        defaultWidth={200}
        minWidth={100}
        maxWidth={400}
        side="left"
      >
        {/* Channel list - left sidebar */}
        <div
          className={`channel-list flex-shrink-0 w-full h-full bg-discord-dark-100
           ${isMobileMenuOpen ? "block" : "hidden"} md:block z-20`}
        >
          <ChannelList
            onToggle={() => {
              toggleChannelList(!isChannelListVisible);
            }}
          />
        </div>
      </ResizableSidebar>

      {/* Main content area - Chat */}
      <div className="flex-grow h-full bg-discord-dark-200 flex flex-col min-w-0 z-10">
        <ChatArea
          isChanListVisible={isChannelListVisible}
          onToggleChanList={() => {
            toggleChannelList(!isChannelListVisible);
          }}
        />
      </div>

      {/* Member list - right sidebar */}
      <ResizableSidebar
        isVisible={isMemberListVisible}
        defaultWidth={240}
        minWidth={80}
        maxWidth={400}
        side="right"
        onMinReached={() => toggleMemberList(false)}
      >
        <div className="flex-1 overflow-hidden h-full bg-discord-dark-100 z-30">
          <MemberList />
        </div>
      </ResizableSidebar>
    </div>
  );
};

export default AppLayout;
