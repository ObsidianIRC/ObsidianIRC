import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { FaTimes, FaWindowMaximize, FaWindowMinimize } from "react-icons/fa";
import type { MessageType } from "../../types";
import { JsonLogMessage } from "./JsonLogMessage";

interface ServerNoticesPopupProps {
  messages: MessageType[];
  onClose: () => void;
  onUsernameContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    channelId: string,
    avatarElement?: Element | null,
  ) => void;
  onIrcLinkClick?: (url: string) => void;
  joinChannel?: (serverId: string, channelName: string) => void;
}

export const ServerNoticesPopup: React.FC<ServerNoticesPopupProps> = ({
  messages,
  onClose,
  onUsernameContextMenu,
  onIrcLinkClick,
  joinChannel,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (isMinimized) {
    return (
      <div
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-lg cursor-move"
        style={{
          left: position.x,
          top: position.y,
          width: "300px",
          height: "40px",
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="text-green-400 font-medium text-sm">
              📋 Server Notices
            </div>
            <div className="text-gray-400 text-xs">({messages.length})</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
              title="Maximize"
            >
              <FaWindowMaximize className="text-xs" />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400"
              title="Close"
            >
              <FaTimes className="text-xs" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 bg-gray-900 border border-gray-600 rounded-lg shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        width: "800px",
        maxWidth: "90vw",
        maxHeight: "80vh",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-gray-600 cursor-move bg-gray-800 rounded-t-lg"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <div className="text-green-400 font-medium">📋 Server Notices</div>
          <div className="text-gray-400 text-sm">({messages.length} logs)</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title="Minimize"
          >
            <FaWindowMinimize className="text-sm" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400"
            title="Close"
          >
            <FaTimes className="text-sm" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        <div className="space-y-2">
          {messages.map((message, index) => (
            <JsonLogMessage
              key={`${message.timestamp}-${index}`}
              message={message}
              showDate={false}
              onUsernameContextMenu={onUsernameContextMenu}
              onIrcLinkClick={onIrcLinkClick}
              joinChannel={joinChannel}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
