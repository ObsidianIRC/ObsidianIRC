import type React from "react";

interface ClickableUsernameProps {
  username: string;
  serverId: string;
  className?: string;
  onContextMenu?: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
  ) => void;
}

export const ClickableUsername: React.FC<ClickableUsernameProps> = ({
  username,
  serverId,
  className = "",
  onContextMenu,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(e, username, serverId);
    }
  };

  return (
    <span
      className={`cursor-pointer ${className}`}
      onClick={handleClick}
      title={`Click to message ${username}`}
    >
      {username}
    </span>
  );
};

export default ClickableUsername;
