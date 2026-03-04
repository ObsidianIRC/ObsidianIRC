import type React from "react";
import { useState } from "react";
import { isUrlFromTrustedSource } from "../../lib/ircUtils";
import useStore from "../../store";

interface MessageAvatarProps {
  userId: string;
  avatarUrl?: string;
  userStatus?: string;
  isAway?: boolean;
  theme: string;
  showHeader: boolean;
  onClick?: (e: React.MouseEvent) => void;
  isClickable?: boolean;
  serverId?: string;
}

export const MessageAvatar: React.FC<MessageAvatarProps> = ({
  userId,
  avatarUrl,
  userStatus,
  isAway,
  theme,
  showHeader,
  onClick,
  isClickable = false,
  serverId,
}) => {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const username = userId.split("-")[0];

  // Get global settings and server info
  const { showSafeMedia, showExternalContent } = useStore(
    (state) => state.globalSettings,
  );
  const server = serverId
    ? useStore.getState().servers.find((s) => s.id === serverId)
    : null;

  // Check if avatar is from a trusted source (server filehost or globally configured trusted URLs)
  const isTrustedAvatar =
    avatarUrl && isUrlFromTrustedSource(avatarUrl, server?.filehost);
  // Show avatar if it's from a trusted source and safe media is enabled, or if external content is allowed
  const shouldShowAvatar =
    avatarUrl && ((isTrustedAvatar && showSafeMedia) || showExternalContent);

  if (!showHeader) {
    return (
      <div className="mr-4">
        <div className="w-8" />
      </div>
    );
  }

  return (
    <div
      className={`mr-4 ${isClickable ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white relative">
        {shouldShowAvatar && !imageLoadFailed ? (
          <img
            src={avatarUrl}
            alt={username}
            className="w-8 h-8 rounded-full object-cover"
            onError={() => {
              // Use React state instead of direct DOM manipulation
              setImageLoadFailed(true);
            }}
          />
        ) : (
          username.charAt(0).toUpperCase()
        )}
        {/* Presence indicator - green if here, yellow if away */}
        <div
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-discord-dark-600 ${isAway ? "bg-discord-yellow" : "bg-discord-green"}`}
        />
        {/* Status metadata indicator (if set via metadata) */}
        {userStatus && (
          <div className="absolute -bottom-1 -left-1 bg-discord-dark-600 rounded-full p-1 group">
            <div className="w-3 h-3 bg-yellow-400 rounded-full flex items-center justify-center">
              <span className="text-xs">💡</span>
            </div>
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block">
              <div className="bg-discord-dark-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {userStatus}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
