import type React from "react";
import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import useStore from "../../store";

const ChannelListModal: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId },
    channelList,
    listChannels,
    toggleChannelListModal,
    joinChannel,
  } = useStore();

  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const rawChannels = selectedServerId
    ? channelList[selectedServerId] || []
    : [];

  const [isLoading, setIsLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"alpha" | "users">("alpha");
  const [filter, setFilter] = useState("");

  const filteredChannels = rawChannels
    .filter((channel) =>
      channel.channel.toLowerCase().includes(filter.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "alpha") {
        return a.channel.localeCompare(b.channel);
      }
      return b.userCount - a.userCount;
    });

  useEffect(() => {
    if (selectedServerId) {
      setIsLoading(true);
      listChannels(selectedServerId);
    }
  }, [selectedServerId, listChannels]);

  useEffect(() => {
    if (rawChannels.length > 0) {
      setIsLoading(false);
    }
  }, [rawChannels]);

  const handleJoinChannel = (channelName: string) => {
    if (selectedServerId) {
      joinChannel(selectedServerId, channelName);
      toggleChannelListModal(false); // Optionally close modal after joining
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">
            Channel List - {selectedServer?.name || "Unknown Server"}
          </h2>
          <button
            onClick={() => toggleChannelListModal(false)}
            className="text-gray-400 hover:text-white"
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className="mb-4 flex gap-4 items-center">
          <input
            type="text"
            placeholder="Filter channels..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-discord-dark-300 text-white px-3 py-2 rounded"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "alpha" | "users")}
            className="bg-discord-dark-300 text-white px-3 py-2 rounded"
          >
            <option value="alpha">Sort by Name</option>
            <option value="users">Sort by Users</option>
          </select>
        </div>

        {isLoading && <p className="text-gray-400 mb-4">Loading channels...</p>}

        <div className="space-y-2">
          {filteredChannels.length === 0 && !isLoading && (
            <p className="text-gray-400">No channels found.</p>
          )}
          {filteredChannels.map((channel) => (
            <div
              key={channel.channel}
              className="bg-discord-dark-300 p-3 rounded flex justify-between items-center cursor-pointer hover:bg-discord-dark-400"
              onClick={() => handleJoinChannel(channel.channel)}
            >
              <div>
                <span className="text-white font-medium">
                  {channel.channel}
                </span>
                <p className="text-gray-400 text-sm">
                  {channel.topic || "No topic"}
                </p>
              </div>
              <span className="text-gray-400 text-sm">
                {channel.userCount} users
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChannelListModal;
