import { platform } from "@tauri-apps/plugin-os";
import type React from "react";
import { useEffect } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import useStore from "../../store";
import type { layoutColumn } from "../../store/types";
import { GlobalNotifications } from "../ui/GlobalNotifications";
import { ChannelList } from "./ChannelList";
import { ChatArea } from "./ChatArea";
import { MemberList } from "./MemberList";
import { ResizableSidebar } from "./ResizableSidebar";
import { ServerList } from "./ServerList";

export const AppLayout: React.FC = () => {
  const {
    ui,
    toggleMobileMenu,
    toggleMemberList,
    toggleChannelList,
    setMobileViewActiveColumn,
  } = useStore();

  const selectedServerId = ui.selectedServerId;
  const currentSelection = ui.perServerSelections[selectedServerId || ""] || {
    selectedChannelId: null,
    selectedPrivateChatId: null,
  };
  const { selectedPrivateChatId } = currentSelection;
  const {
    isDarkMode,
    isMobileMenuOpen,
    isMemberListVisible,
    isChannelListVisible,
    mobileViewActiveColumn,
  } = ui;

  // Hide member list for private chats
  const shouldShowMemberList = isMemberListVisible && !selectedPrivateChatId;

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

  const isNarrowView = useMediaQuery();
  const isTooNarrowForMemberList = useMediaQuery("(max-width: 1080px)");

  const getLayoutColumnElement = (column: layoutColumn) => {
    switch (column) {
      case "serverList":
        return (
          <>
            {__HIDE_SERVER_LIST__ ? null : (
              <div
                className={`server-list flex-shrink-0 h-full bg-discord-dark-300 z-30 ${
                  isNarrowView && mobileViewActiveColumn === "serverList"
                    ? "w-[72px]"
                    : isNarrowView
                      ? "w-0"
                      : "w-[72px]"
                }`}
              >
                <ServerList />
              </div>
            )}

            <ResizableSidebar
              bypass={isNarrowView && mobileViewActiveColumn === "serverList"}
              isVisible={isChannelListVisible}
              defaultWidth={264}
              minWidth={80}
              maxWidth={400}
              side="left"
              onMinReached={() => toggleChannelList(false)}
            >
              <div
                className={`channel-list ${isNarrowView ? "w-[calc(100vw-72px)]" : "w-full"} h-full bg-discord-dark-100 md:block z-20`}
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
            bypass={isNarrowView && mobileViewActiveColumn === "memberList"}
            isVisible={shouldShowMemberList}
            defaultWidth={280}
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

  // Sync mobile/desktop view states
  useEffect(() => {
    if (!isNarrowView) {
      // Desktop: auto-hide member list only if too narrow
      if (isTooNarrowForMemberList && isMemberListVisible) {
        toggleMemberList(false);
      }
      return; // Don't handle mobile logic on desktop
    }

    // Mobile: sync toggles with mobileViewActiveColumn
    switch (mobileViewActiveColumn) {
      case "serverList":
        if (!isChannelListVisible) toggleChannelList(true);
        if (isMemberListVisible) toggleMemberList(false);
        break;
      case "chatView":
        if (isChannelListVisible) toggleChannelList(false);
        if (isMemberListVisible) toggleMemberList(false);
        break;
      case "memberList":
        if (isChannelListVisible) toggleChannelList(false);
        if (!isMemberListVisible) toggleMemberList(true);
        break;
    }
  }, [
    isNarrowView,
    isTooNarrowForMemberList,
    mobileViewActiveColumn,
    isChannelListVisible,
    isMemberListVisible,
    toggleChannelList,
    toggleMemberList,
  ]);

  const getLayoutColumn = (column: layoutColumn) => {
    // On mobile, only show the active column
    if (isNarrowView && column !== mobileViewActiveColumn) return null;
    return getLayoutColumnElement(column);
  };

  // Handle mobile back button
  // TODO: ios
  if ("__TAURI__" in window && platform() === "android") {
    // @ts-expect-error
    window.androidBackCallback = () => {
      switch (mobileViewActiveColumn) {
        case "chatView":
          setMobileViewActiveColumn("serverList");
          toggleChannelList(true);
          return false; // the android back will be prevented
        case "memberList":
          setMobileViewActiveColumn("chatView");
          toggleMemberList(false);
          return false; // the android back will be prevented
        default:
          return true; // the default android back
      }
    };
  }

  return (
    <div
      className={`flex h-screen overflow-hidden bg-discord-dark-300 ${
        isDarkMode ? "text-white" : "text-gray-900"
      }`}
      style={{
        paddingTop: "var(--safe-area-inset-top)",
        paddingRight: "var(--safe-area-inset-right)",
        paddingBottom: "var(--safe-area-inset-bottom)",
        paddingLeft: "var(--safe-area-inset-left)",
      }}
    >
      {getLayoutColumn("serverList")}
      {getLayoutColumn("chatView")}
      {selectedServerId && getLayoutColumn("memberList")}
      <GlobalNotifications />
    </div>
  );
};

export default AppLayout;
