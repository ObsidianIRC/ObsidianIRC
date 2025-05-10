import type React from "react";
import { useState } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import useStore from "../../store";
import type { User } from "../../types";

const StatusIndicator: React.FC<{ status?: string }> = ({ status }) => {
  let bgColor = "bg-discord-dark-500"; // Default/offline

  if (status === "online") {
    bgColor = "bg-discord-green";
  } else if (status === "idle") {
    bgColor = "bg-discord-yellow";
  } else if (status === "dnd") {
    bgColor = "bg-discord-red";
  }

  return <div className={`w-3 h-3 rounded-full ${bgColor}`} />;
};

const UserItem: React.FC<{ user: User }> = ({ user }) => {
  return (
    <div className="flex items-center py-2 px-3 mx-2 rounded hover:bg-discord-dark-400 cursor-pointer">
      <div className="w-10 h-10 rounded-full bg-discord-dark-400 flex items-center justify-center text-white text-lg font-bold">
        {user.username.charAt(0).toUpperCase()}
      </div>
      <span className="ml-3">{user.username}</span>
    </div>
  );
};

const collapseState = new Map<string, boolean>(); // Persistent state for categories

const Category: React.FC<{
  title: string;
  users: User[];
  channelId: string | null;
}> = ({ title, users, channelId }) => {
  const categoryKey = `${channelId}-${title}`; // Unique key for each category in a channel

  if (!channelId) return;

  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Check if the state is already stored; otherwise, use the default rule
    return collapseState.get(categoryKey) ?? users.length > 30;
  });

  const handleToggle = () => {
    const newState = !isCollapsed;
    collapseState.set(categoryKey, newState); // Persist the user's choice
    setIsCollapsed(newState);
  };

  if (!users.length) return null;

  return (
    <div className="mb-4">
      <div
        className="flex justify-between items-center cursor-pointer px-2"
        onClick={handleToggle}
      >
        <h3 className="text-xs font-semibold text-discord-channels-default uppercase mb-2">
          {title} — {users.length}
        </h3>
        <span className="text-discord-channels-default text-sm">
          {isCollapsed ? <FaChevronDown /> : <FaChevronUp />}
        </span>
      </div>
      {!isCollapsed && (
        <div>
          {users.map((user) => (
            <UserItem key={user.id} user={user} />
          ))}
        </div>
      )}
    </div>
  );
};

export const MemberList: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId, selectedChannelId },
  } = useStore();

  const selectedServer = servers.find(
    (server) => server.id === selectedServerId,
  );
  const selectedChannel = selectedServer?.channels.find(
    (channel) => channel.id === selectedChannelId,
  );

  // Categorize users based on their status
  const categorizedUsers = selectedChannel?.users.reduce(
    (acc, user) => {
      const statusChar = user.status?.charAt(0);
      if (statusChar === "~") {
        acc.owners.push(user);
      } else if (statusChar === "&") {
        acc.admins.push(user);
      } else if (statusChar === "@") {
        acc.operators.push(user);
      } else if (statusChar === "%") {
        acc.halfOps.push(user);
      } else if (statusChar === "+") {
        acc.voiced.push(user);
      } else {
        acc.members.push(user);
      }
      return acc;
    },
    {
      owners: [] as User[],
      admins: [] as User[],
      operators: [] as User[],
      halfOps: [] as User[],
      voiced: [] as User[],
      members: [] as User[],
    },
  );

  return (
    <div className="p-3 h-full overflow-y-auto">
      {categorizedUsers && (
        <>
          <Category
            title="Channel Owners"
            users={categorizedUsers.owners}
            channelId={selectedChannelId}
          />
          <Category
            title="Channel Admins"
            users={categorizedUsers.admins}
            channelId={selectedChannelId}
          />
          <Category
            title="Channel Operators"
            users={categorizedUsers.operators}
            channelId={selectedChannelId}
          />
          <Category
            title="Channel Half-Ops"
            users={categorizedUsers.halfOps}
            channelId={selectedChannelId}
          />
          <Category
            title="Voiced Members"
            users={categorizedUsers.voiced}
            channelId={selectedChannelId}
          />
          <Category
            title="Members"
            users={categorizedUsers.members}
            channelId={selectedChannelId}
          />
        </>
      )}
    </div>
  );
};

export default MemberList;
