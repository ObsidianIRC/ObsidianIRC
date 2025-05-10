import type React from "react";
import { useEffect } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
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
      mobileViewActiveColumn,
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

  const getLayoutColumnElement = (column: layoutColumn) => {
    switch (column) {
      case "serverList":
        return (
          <>
            <div className="server-list flex-shrink-0 w-[72px] h-full bg-discord-dark-300 z-30">
              <ServerList />
            </div>
            <ResizableSidebar
              bypass={isMobileView && mobileViewActiveColumn === "serverList"}
              isVisible={isChannelListVisible}
              defaultWidth={200}
              minWidth={80}
              maxWidth={400}
              side="left"
              onMinReached={() => toggleChannelList(false)}
            >
              <div
                className={
                  "channel-list w-full h-full bg-discord-dark-100 md:block z-20"
                }
              >
                <ChannelList
                  onToggle={() => {
                    toggleChannelList(!isChannelListVisible);
                  }}
                />
              </div>
            </ResizableSidebar>
          </>
        );
      case "chatView":
        return (
          <div className="flex-grow h-full bg-discord-dark-200 flex flex-col min-w-0 z-10">
            <ChatArea
              isChanListVisible={isChannelListVisible}
              onToggleChanList={() => {
                toggleChannelList(!isChannelListVisible);
              }}
            />
          </div>
        );
      case "memberList":
        return (
          <ResizableSidebar
            bypass={isMobileView && mobileViewActiveColumn === "memberList"}
            isVisible={isMemberListVisible}
            defaultWidth={240}
            minWidth={80}
            maxWidth={400}
            side="right"
            onMinReached={() => toggleMemberList(false)}
          >
            <div className="flex-1 overflow-hidden h-full bg-discord-dark-100">
              <MemberList />
            </div>
          </ResizableSidebar>
        );
    }
  };
  const isMobileView = useMediaQuery();
  const isTooNarrowForMemberList = useMediaQuery("(max-width: 1080px)");

  // Set correct state for mobile view
  useEffect(() => {
    if (isMobileView) {
      switch (mobileViewActiveColumn) {
        case "serverList":
          toggleChannelList(true);
          break;
        case "chatView":
          toggleChannelList(false);
          toggleMemberList(false);
          break;
        case "memberList":
          toggleChannelList(false);
          break;
      }
    } else {
      toggleChannelList(true);
    }
  }, [
    isMobileView,
    mobileViewActiveColumn,
    toggleChannelList,
    toggleMemberList,
  ]);

  // Hide member list if the screen is too narrow
  useEffect(() => {
    if (isMobileView) return;
    toggleMemberList(!isTooNarrowForMemberList);
  }, [isTooNarrowForMemberList, toggleMemberList, isMobileView]);

  const getLayoutColumn = (column: layoutColumn) => {
    if (isMobileView && column !== mobileViewActiveColumn) return;
    return getLayoutColumnElement(column);
  };

  return (
    <div
      className={`flex h-screen overflow-hidden bg-discord-dark-300 ${
        isDarkMode ? "text-white" : "text-gray-900"
      }`}
    >
      {getLayoutColumn("serverList")}
      {getLayoutColumn("chatView")}
      {getLayoutColumn("memberList")}
    </div>
  );
};

export default AppLayout;
