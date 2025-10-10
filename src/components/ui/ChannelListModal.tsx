import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import { getChannelAvatarUrl, getChannelDisplayName } from "../../lib/ircUtils";
import useStore from "../../store";

const ChannelListModal: React.FC = () => {
  const {
    servers,
    ui: { selectedServerId },
    channelList,
    channelMetadataCache,
    listChannels,
    toggleChannelListModal,
    joinChannel,
  } = useStore();

  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const rawChannels = selectedServerId
    ? channelList[selectedServerId] || []
    : [];
  const metadataCache = selectedServerId
    ? channelMetadataCache[selectedServerId] || {}
    : {};

  const [isLoading, setIsLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"alpha" | "users">("alpha");
  const [filter, setFilter] = useState("");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const channelRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  // Fetch metadata for visible channels
  const fetchMetadataForChannels = useCallback(
    (channelNames: string[]) => {
      if (!selectedServerId || channelNames.length === 0) return;

      // Use the store function to fetch metadata
      // This function is defined in the store
      const state = useStore.getState();
      const now = Date.now();
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

      const channelsToFetch = channelNames.filter((channelName) => {
        const cached = metadataCache[channelName];
        const queue = state.channelMetadataFetchQueue[selectedServerId];
        const alreadyQueued = queue?.has(channelName);
        const isCacheValid = cached && now - cached.fetchedAt < CACHE_TTL;
        return !isCacheValid && !alreadyQueued;
      });

      if (channelsToFetch.length === 0) return;

      // Add to queue
      const queue =
        state.channelMetadataFetchQueue[selectedServerId] || new Set();
      const newQueue = new Set(queue);
      for (const ch of channelsToFetch) {
        newQueue.add(ch);
      }

      useStore.setState((state) => ({
        channelMetadataFetchQueue: {
          ...state.channelMetadataFetchQueue,
          [selectedServerId]: newQueue,
        },
      }));

      // Fetch metadata for each channel
      channelsToFetch.forEach((channelName) => {
        ircClient.metadataGet(selectedServerId, channelName, [
          "avatar",
          "display-name",
        ]);
      });
    },
    [selectedServerId, metadataCache],
  );

  // Setup IntersectionObserver
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visibleChannels = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.getAttribute("data-channel"))
          .filter((ch): ch is string => ch !== null);

        if (visibleChannels.length > 0) {
          fetchMetadataForChannels(visibleChannels);
        }
      },
      {
        root: null,
        rootMargin: "100px", // Start loading slightly before they come into view
        threshold: 0.1,
      },
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [fetchMetadataForChannels]);

  // Observe channel elements
  useEffect(() => {
    if (!observerRef.current) return;

    channelRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      if (observerRef.current) {
        channelRefs.current.forEach((element) => {
          observerRef.current?.unobserve(element);
        });
      }
    };
  }, []);

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

  const setChannelRef = (
    channelName: string,
    element: HTMLDivElement | null,
  ) => {
    if (element) {
      channelRefs.current.set(channelName, element);
    } else {
      channelRefs.current.delete(channelName);
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
          {filteredChannels.map((channel) => {
            const metadata = metadataCache[channel.channel];
            const avatarUrl = metadata?.avatar
              ? getChannelAvatarUrl(
                  { avatar: { value: metadata.avatar, visibility: "public" } },
                  32,
                )
              : null;
            const displayName = metadata?.displayName;
            const hasMetadata = !!(avatarUrl || displayName);

            return (
              <div
                key={channel.channel}
                ref={(el) => setChannelRef(channel.channel, el)}
                data-channel={channel.channel}
                className="bg-discord-dark-300 p-3 rounded flex justify-between items-center cursor-pointer hover:bg-discord-dark-400"
                onClick={() => handleJoinChannel(channel.channel)}
              >
                <div className="flex items-center gap-3 flex-1">
                  {/* Channel icon */}
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={channel.channel}
                        className="w-8 h-8 rounded-full object-cover"
                        onError={(e) => {
                          // Fallback to # icon if image fails to load
                          e.currentTarget.style.display = "none";
                          const fallback = e.currentTarget
                            .nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = "block";
                        }}
                      />
                    ) : null}
                    <span
                      className="text-gray-400 text-xl font-bold"
                      style={{ display: avatarUrl ? "none" : "block" }}
                    >
                      #
                    </span>
                  </div>

                  {/* Channel name and topic */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">
                        {displayName ||
                          getChannelDisplayName(channel.channel, {})}
                      </span>
                      {hasMetadata &&
                        displayName &&
                        displayName !== channel.channel.substring(1) && (
                          <span className="text-xs bg-discord-dark-400 text-gray-300 px-2 py-0.5 rounded">
                            {channel.channel}
                          </span>
                        )}
                    </div>
                    <p className="text-gray-400 text-sm">
                      {channel.topic || "No topic"}
                    </p>
                  </div>
                </div>

                <span className="text-gray-400 text-sm flex-shrink-0 ml-2">
                  {channel.userCount} users
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChannelListModal;
