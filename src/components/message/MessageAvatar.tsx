import type React from "react";

interface MessageAvatarProps {
  userId: string;
  avatarUrl?: string;
  userStatus?: string;
  theme: string;
  showHeader: boolean;
  onClick?: (e: React.MouseEvent) => void;
  isClickable?: boolean;
}

export const MessageAvatar: React.FC<MessageAvatarProps> = ({
  userId,
  avatarUrl,
  userStatus,
  theme,
  showHeader,
  onClick,
  isClickable = false,
}) => {
  const username = userId.split("-")[0];

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
      <div
        className={`w-8 h-8 rounded-full bg-${theme}-dark-400 flex items-center justify-center text-white relative`}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={username}
            className="w-8 h-8 rounded-full object-cover"
            onError={(e) => {
              // Fallback to initial if image fails to load
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                parent.textContent = username.charAt(0).toUpperCase();
              }
            }}
          />
        ) : (
          username.charAt(0).toUpperCase()
        )}
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
