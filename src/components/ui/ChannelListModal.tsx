import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaUsers } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import { getChannelAvatarUrl, getChannelDisplayName } from "../../lib/ircUtils";
import useStore from "../../store";
import { SimpleModal } from "../modals";

const ChannelListModal: React.FC = () => {
  const {
    servers,
    ui,
    channelList,
    channelMetadataCache,
    listingInProgress,
    channelListFilters,
    listChannels,
    updateChannelListFilters,
    closeModal,
    joinChannel,
  } = useStore();

  const { selectedServerId } = ui;
  const isOpen = ui.modals.channelList?.isOpen || false;

  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const elist = (selectedServer?.elist || "").toUpperCase();
  const rawChannels = selectedServerId
    ? channelList[selectedServerId] || []
    : [];
  const metadataCache = selectedServerId
    ? channelMetadataCache[selectedServerId] || {}
    : {};

  const [sortBy, setSortBy] = useState<"alpha" | "users">("users");
  const [filter, setFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [minUsers, setMinUsers] = useState<number>(0);
  const [maxUsers, setMaxUsers] = useState<number>(0);
  const [minCreationTime, setMinCreationTime] = useState<number>(0);
  const [maxCreationTime, setMaxCreationTime] = useState<number>(0);
  const [minTopicTime, setMinTopicTime] = useState<number>(0);
  const [maxTopicTime, setMaxTopicTime] = useState<number>(0);
  const [mask, setMask] = useState<string>("");
  const [notMask, setNotMask] = useState<string>("");
  const [displayedChannelsCount, setDisplayedChannelsCountState] =
    useState<number>(50); // Start with 50 channels initially
  const [loadingMore, setLoadingMoreState] = useState<boolean>(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const channelRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevFilteredLengthRef = useRef<number>(0);
  const loadingMoreRef = useRef<boolean>(false);
  const displayedCountRef = useRef<number>(50);

  // Custom setters that update both state and refs
  const setLoadingMore = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const newValue =
        typeof value === "function" ? value(loadingMoreRef.current) : value;
      loadingMoreRef.current = newValue;
      setLoadingMoreState(newValue);
    },
    [],
  );

  const setDisplayedChannelsCount = useCallback(
    (value: number | ((prev: number) => number)) => {
      const newValue =
        typeof value === "function" ? value(displayedCountRef.current) : value;
      displayedCountRef.current = newValue;
      setDisplayedChannelsCountState(newValue);
    },
    [],
  );

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
    if (selectedServerId && isOpen) {
      listChannels(selectedServerId);
    }
  }, [selectedServerId, isOpen, listChannels]);

  // Sync filter state with store
  useEffect(() => {
    if (selectedServerId && channelListFilters[selectedServerId]) {
      const filters = channelListFilters[selectedServerId];
      setMinUsers(filters.minUsers || 0);
      setMaxUsers(filters.maxUsers || 0);
      setMinCreationTime(filters.minCreationTime || 0);
      setMaxCreationTime(filters.maxCreationTime || 0);
      setMinTopicTime(filters.minTopicTime || 0);
      setMaxTopicTime(filters.maxTopicTime || 0);
      setMask(filters.mask || "");
      setNotMask(filters.notMask || "");
    }
  }, [selectedServerId, channelListFilters]);

  // Scroll detection for lazy loading
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100; // 100px threshold

      if (
        isNearBottom &&
        !loadingMoreRef.current &&
        displayedCountRef.current < filteredChannels.length
      ) {
        setLoadingMore(true);
        // Load next 50 channels
        setTimeout(() => {
          setDisplayedChannelsCount((prev) =>
            Math.min(prev + 50, filteredChannels.length),
          );
          setLoadingMore(false);
        }, 200); // Small delay for smooth UX
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [filteredChannels.length, setDisplayedChannelsCount, setLoadingMore]); // Only depend on filteredChannels.length to avoid recreating listener too often

  // Reset displayed count when filtered channels change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (prevFilteredLengthRef.current !== filteredChannels.length) {
      setDisplayedChannelsCount(50); // Reset to initial count when filters change
      prevFilteredLengthRef.current = filteredChannels.length;
    }
  }, [filteredChannels.length, setDisplayedChannelsCount]);

  const applyFilters = () => {
    if (!selectedServerId) return;

    const filters = {
      minUsers: minUsers > 0 ? minUsers : undefined,
      maxUsers: maxUsers > 0 ? maxUsers : undefined,
      minCreationTime: minCreationTime > 0 ? minCreationTime : undefined,
      maxCreationTime: maxCreationTime > 0 ? maxCreationTime : undefined,
      minTopicTime: minTopicTime > 0 ? minTopicTime : undefined,
      maxTopicTime: maxTopicTime > 0 ? maxTopicTime : undefined,
      mask: mask.trim() || undefined,
      notMask: notMask.trim() || undefined,
    };

    updateChannelListFilters(selectedServerId, filters);
    listChannels(selectedServerId, filters);
  };

  const handleJoinChannel = (channelName: string) => {
    if (selectedServerId) {
      joinChannel(selectedServerId, channelName);
      closeModal("channelList"); // Close modal after joining
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

  const modalTitle = `Channels on ${selectedServer?.networkName || selectedServer?.name || "Unknown Network"}`;

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={() => closeModal("channelList")}
      title={modalTitle}
      maxWidth="2xl"
    >
      <div className="mb-4 flex-shrink-0">
        <span className="bg-blue-600 text-white text-sm px-3 py-2 rounded-lg font-semibold shadow-sm">
          Total: {filteredChannels.length}
        </span>
      </div>

      <div className="mb-4 flex gap-4 items-center flex-shrink-0">
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

      {/* Advanced Filters */}
      <div className="mb-4 flex-shrink-0">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="text-gray-300 hover:text-white text-sm mb-2 flex items-center gap-2"
        >
          <span>{showFilters ? "▼" : "▶"} Advanced Filters</span>
        </button>

        {showFilters && (
          <div className="bg-discord-dark-300 p-3 rounded space-y-3">
            <div className="grid grid-cols-1 gap-3">
              {/* User Count Filtering (U extension) */}
              {elist.includes("U") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Min Users
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={minUsers}
                      onChange={(e) =>
                        setMinUsers(Number.parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full bg-discord-dark-400 text-white px-2 py-1 rounded text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Max Users
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maxUsers}
                      onChange={(e) =>
                        setMaxUsers(Number.parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full bg-discord-dark-400 text-white px-2 py-1 rounded text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {/* Creation Time Filtering (C extension) */}
              {elist.includes("C") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Created After (min ago)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={minCreationTime}
                      onChange={(e) =>
                        setMinCreationTime(
                          Number.parseInt(e.target.value, 10) || 0,
                        )
                      }
                      className="w-full bg-discord-dark-400 text-white px-2 py-1 rounded text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Created Before (min ago)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maxCreationTime}
                      onChange={(e) =>
                        setMaxCreationTime(
                          Number.parseInt(e.target.value, 10) || 0,
                        )
                      }
                      className="w-full bg-discord-dark-400 text-white px-2 py-1 rounded text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {/* Topic Time Filtering (T extension) */}
              {elist.includes("T") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Topic Set After (min ago)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={minTopicTime}
                      onChange={(e) =>
                        setMinTopicTime(
                          Number.parseInt(e.target.value, 10) || 0,
                        )
                      }
                      className="w-full bg-discord-dark-400 text-white px-2 py-1 rounded text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Topic Set Before (min ago)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maxTopicTime}
                      onChange={(e) =>
                        setMaxTopicTime(
                          Number.parseInt(e.target.value, 10) || 0,
                        )
                      }
                      className="w-full bg-discord-dark-400 text-white px-2 py-1 rounded text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {/* Mask Filtering (M extension) */}
              {elist.includes("M") && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Channel Name Mask
                  </label>
                  <input
                    type="text"
                    value={mask}
                    onChange={(e) => setMask(e.target.value)}
                    className="w-full bg-discord-dark-400 text-white px-2 py-1 rounded text-sm"
                    placeholder="*channel*"
                  />
                </div>
              )}

              {/* Non-matching Mask Filtering (N extension) */}
              {elist.includes("N") && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Exclude Channel Name Mask
                  </label>
                  <input
                    type="text"
                    value={notMask}
                    onChange={(e) => setNotMask(e.target.value)}
                    className="w-full bg-discord-dark-400 text-white px-2 py-1 rounded text-sm"
                    placeholder="*spam*"
                  />
                </div>
              )}

              {elist.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-2">
                  Server doesn't support advanced LIST filtering
                </div>
              )}
            </div>

            <button
              onClick={applyFilters}
              className="w-full bg-discord-primary hover:bg-discord-primary-hover text-white py-2 px-4 rounded text-sm font-medium"
            >
              Apply Filters & Refresh
            </button>
          </div>
        )}
      </div>

      {selectedServerId && listingInProgress[selectedServerId] && (
        <p className="text-gray-400 mb-4 flex-shrink-0">Loading channels...</p>
      )}

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-2">
          {filteredChannels.length === 0 &&
            !(selectedServerId && listingInProgress[selectedServerId]) && (
              <p className="text-gray-400">No channels found.</p>
            )}
          {filteredChannels.slice(0, displayedChannelsCount).map((channel) => {
            const metadata = metadataCache[channel.channel];
            const avatarUrl = metadata?.avatar
              ? getChannelAvatarUrl(
                  {
                    avatar: {
                      value: metadata.avatar,
                      visibility: "public",
                    },
                  },
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

                <span className="text-gray-400 text-sm flex-shrink-0 ml-2 flex items-center gap-1">
                  <FaUsers size={12} />
                  {channel.userCount}
                </span>
              </div>
            );
          })}
          {loadingMore && (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm">Loading more channels...</p>
            </div>
          )}
          {displayedChannelsCount < filteredChannels.length && !loadingMore && (
            <div className="text-center py-4">
              <p className="text-gray-500 text-xs">
                Showing {displayedChannelsCount} of {filteredChannels.length}{" "}
                channels
              </p>
            </div>
          )}
        </div>
      </div>
    </SimpleModal>
  );
};

export default ChannelListModal;
