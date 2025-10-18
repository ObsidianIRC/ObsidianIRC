import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaBan,
  FaCog,
  FaEdit,
  FaPlus,
  FaShieldAlt,
  FaSlidersH,
  FaSpinner,
  FaTimes,
  FaTrash,
  FaUserPlus,
} from "react-icons/fa";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import ircClient from "../../lib/ircClient";
import { hasOpPermission } from "../../lib/ircUtils";
import useStore, { serverSupportsMetadata } from "../../store";
import type { Channel } from "../../types";
import AvatarUpload from "./AvatarUpload";

interface ChannelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  channelName: string;
}

interface ChannelMode {
  type: "b" | "e" | "I";
  mask: string;
  setter?: string;
  timestamp?: number;
}

const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
  isOpen,
  onClose,
  serverId,
  channelName,
}) => {
  const [modes, setModes] = useState<ChannelMode[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "b" | "e" | "I" | "general" | "settings"
  >("b");
  const [newMask, setNewMask] = useState("");
  const [editingMask, setEditingMask] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingMasks, setRemovingMasks] = useState(new Set<string>());

  // Metadata state
  const [channelAvatar, setChannelAvatar] = useState("");
  const [channelDisplayName, setChannelDisplayName] = useState("");
  const [channelTopic, setChannelTopic] = useState("");
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false);
  const [isUpdatingTopic, setIsUpdatingTopic] = useState(false);
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);

  const hasFetchedRef = useRef(false);
  const isParsingRef = useRef(false);

  const servers = useStore((state) => state.servers);
  const { metadataSet } = useStore();
  const server = servers.find((s) => s.id === serverId);
  const channel = server?.channels.find((c) => c.name === channelName);

  // Get current user's status in this channel
  const currentUser = ircClient.getCurrentUser(serverId);
  const currentUserInChannel = channel?.users.find(
    (u) => u.username === currentUser?.username,
  );
  const userHasOpPermission = hasOpPermission(currentUserInChannel?.status);
  const supportsMetadata = serverSupportsMetadata(serverId);
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Define tab categories
  const categories = [
    ...(userHasOpPermission && supportsMetadata
      ? [
          {
            id: "general" as const,
            name: "General",
            icon: FaSlidersH,
            count: 0,
          },
        ]
      : []),
    {
      id: "b" as const,
      name: "Bans",
      icon: FaBan,
      count: modes.filter((m) => m.type === "b").length,
    },
    {
      id: "e" as const,
      name: "Exceptions",
      icon: FaShieldAlt,
      count: modes.filter((m) => m.type === "e").length,
    },
    {
      id: "I" as const,
      name: "Invitations",
      icon: FaUserPlus,
      count: modes.filter((m) => m.type === "I").length,
    },
    ...(userHasOpPermission && supportsMetadata
      ? [{ id: "settings" as const, name: "Settings", icon: FaCog, count: 0 }]
      : []),
  ];

  // Set initial tab based on permissions
  useEffect(() => {
    if (isOpen && userHasOpPermission && supportsMetadata) {
      setActiveTab("general");
    }
  }, [isOpen, userHasOpPermission, supportsMetadata]);

  // Reset fetch state when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasFetchedRef.current = false;
    }
  }, [isOpen]);

  const clearLists = useCallback(() => {
    useStore.setState((state) => {
      const updatedServers = state.servers.map((server) => {
        if (server.id === serverId) {
          const updatedChannels = server.channels.map((ch) => {
            if (ch.name === channelName) {
              return { ...ch, bans: [], invites: [], exceptions: [] };
            }
            return ch;
          });
          return { ...server, channels: updatedChannels };
        }
        return server;
      });
      return { servers: updatedServers };
    });
  }, [serverId, channelName]);

  const parseChannelModes = useCallback((currentChannel: Channel) => {
    if (isParsingRef.current) return;
    isParsingRef.current = true;
    const parsedModes: ChannelMode[] = [];

    // Add bans
    if (currentChannel.bans) {
      currentChannel.bans.forEach((ban) => {
        parsedModes.push({
          type: "b",
          mask: ban.mask,
          setter: ban.setter,
          timestamp: ban.timestamp,
        });
      });
    }

    // Add exceptions
    if (currentChannel.exceptions) {
      currentChannel.exceptions.forEach((exception) => {
        parsedModes.push({
          type: "e",
          mask: exception.mask,
          setter: exception.setter,
          timestamp: exception.timestamp,
        });
      });
    }

    // Add invites
    if (currentChannel.invites) {
      currentChannel.invites.forEach((invite) => {
        parsedModes.push({
          type: "I",
          mask: invite.mask,
          setter: invite.setter,
          timestamp: invite.timestamp,
        });
      });
    }

    console.log("Parsed modes:", parsedModes);
    setModes(parsedModes);
    isParsingRef.current = false;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: clearLists and parseChannelModes are stable
  const fetchChannelModes = useCallback(async () => {
    console.log(
      `fetchChannelModes called for channel ${channelName} on server ${serverId}`,
    );
    setLoading(true);
    try {
      // Clear existing mode lists
      clearLists();

      // Request channel modes from server
      console.log(`Sending MODE command: MODE ${channelName} +beI`);
      await ircClient.sendRaw(serverId, `MODE ${channelName} +beI`);

      // Wait for responses and update UI
      setTimeout(() => {
        const updatedServer = useStore
          .getState()
          .servers.find((s) => s.id === serverId);
        const updatedChannel = updatedServer?.channels.find(
          (c) => c.name === channelName,
        );
        if (updatedChannel) {
          console.log("Updated channel data:", {
            bans: updatedChannel.bans,
            invites: updatedChannel.invites,
            exceptions: updatedChannel.exceptions,
          });
          parseChannelModes(updatedChannel);
        }
        setLoading(false);
      }, 1000); // Give some time for the responses
    } catch (error) {
      console.error("Failed to fetch channel modes:", error);
      setLoading(false);
    }
  }, [serverId, channelName]);

  const addMode = async (type: "b" | "e" | "I", mask: string) => {
    setIsAdding(true);
    try {
      await ircClient.sendRaw(serverId, `MODE ${channelName} +${type} ${mask}`);
      setNewMask("");
      // Re-fetch the lists after the change
      setTimeout(() => {
        clearLists();
        ircClient.sendRaw(serverId, `MODE ${channelName} +beI`);
        // Wait for responses and update UI
        setTimeout(() => {
          const updatedServer = useStore
            .getState()
            .servers.find((s) => s.id === serverId);
          const updatedChannel = updatedServer?.channels.find(
            (c) => c.name === channelName,
          );
          if (updatedChannel) {
            parseChannelModes(updatedChannel);
          }
          setIsAdding(false);
        }, 1000);
      }, 500);
    } catch (error) {
      console.error(`Failed to add ${type} mode:`, error);
      setIsAdding(false);
    }
  };

  const removeMode = async (type: "b" | "e" | "I", mask: string) => {
    setRemovingMasks((prev) => new Set(prev).add(mask));
    try {
      await ircClient.sendRaw(serverId, `MODE ${channelName} -${type} ${mask}`);
      // Re-fetch the lists after the change
      setTimeout(() => {
        clearLists();
        ircClient.sendRaw(serverId, `MODE ${channelName} +beI`);
        // Wait for responses and update UI
        setTimeout(() => {
          const updatedServer = useStore
            .getState()
            .servers.find((s) => s.id === serverId);
          const updatedChannel = updatedServer?.channels.find(
            (c) => c.name === channelName,
          );
          if (updatedChannel) {
            parseChannelModes(updatedChannel);
          }
          setRemovingMasks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(mask);
            return newSet;
          });
        }, 1000);
      }, 500);
    } catch (error) {
      console.error(`Failed to remove ${type} mode:`, error);
      setRemovingMasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(mask);
        return newSet;
      });
    }
  };

  const startEditing = (mask: string) => {
    setEditingMask(mask);
    setEditValue(mask);
  };

  const cancelEditing = () => {
    setEditingMask(null);
    setEditValue("");
  };

  const saveEdit = async (oldMask: string, newMask: string) => {
    if (oldMask === newMask) {
      cancelEditing();
      return;
    }

    try {
      // Remove old mask and add new one
      await ircClient.sendRaw(
        serverId,
        `MODE ${channelName} -${activeTab} ${oldMask}`,
      );
      await ircClient.sendRaw(
        serverId,
        `MODE ${channelName} +${activeTab} ${newMask}`,
      );
      cancelEditing();
      // Re-fetch the lists after the change
      setTimeout(() => {
        clearLists();
        ircClient.sendRaw(serverId, `MODE ${channelName} +beI`);
        // Wait for responses and update UI
        setTimeout(() => {
          const updatedServer = useStore
            .getState()
            .servers.find((s) => s.id === serverId);
          const updatedChannel = updatedServer?.channels.find(
            (c) => c.name === channelName,
          );
          if (updatedChannel) {
            parseChannelModes(updatedChannel);
          }
        }, 1000);
      }, 500);
    } catch (error) {
      console.error(`Failed to edit ${activeTab} mode:`, error);
    }
  };

  const filteredModes = modes.filter((mode) => mode.type === activeTab);

  // Handle applying all general tab changes
  const applyGeneralChanges = async () => {
    setIsApplyingChanges(true);
    try {
      // Apply topic change
      if (channelTopic !== (channel?.topic || "")) {
        ircClient.setTopic(serverId, channelName, channelTopic);
      }

      // Apply avatar change
      if (channelAvatar !== (channel?.metadata?.avatar?.value || "")) {
        await metadataSet(
          serverId,
          channelName,
          "avatar",
          channelAvatar || undefined,
        );
      }

      // Apply display name change
      if (
        channelDisplayName !==
        (channel?.metadata?.["display-name"]?.value || "")
      ) {
        await metadataSet(
          serverId,
          channelName,
          "display-name",
          channelDisplayName || undefined,
        );
      }
    } finally {
      setIsApplyingChanges(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: Using channelName instead of channel to avoid infinite loop from object reference changes
  useEffect(() => {
    if (isOpen && channel) {
      // Clear current modes and fetch new ones when channel changes
      setModes([]);
      hasFetchedRef.current = false;
      fetchChannelModes();
    }
  }, [isOpen, channelName, fetchChannelModes]);

  // Load channel metadata when modal opens
  useEffect(() => {
    if (isOpen && channel) {
      setChannelAvatar(channel.metadata?.avatar?.value || "");
      setChannelDisplayName(channel.metadata?.["display-name"]?.value || "");
      setChannelTopic(channel.topic || "");
    }
  }, [isOpen, channel]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-4xl h-[80vh] flex overflow-hidden">
        {/* Sidebar */}
        <div className="bg-discord-dark-300 flex flex-col">
          <div className="p-4 border-b border-discord-dark-500 flex justify-center">
            {isMobile ? (
              <FaCog className="text-white text-xl" />
            ) : (
              <h2 className="text-white text-lg font-bold">Channel Settings</h2>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <nav className="p-2">
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveTab(category.id)}
                    className={`flex items-center ${isMobile ? "justify-center px-2" : "w-full px-3 text-left"} py-2 mb-1 rounded transition-colors overflow-hidden min-w-0 ${
                      activeTab === category.id
                        ? "bg-discord-primary text-white"
                        : "text-discord-text-muted hover:text-white hover:bg-discord-dark-400"
                    }`}
                  >
                    <Icon
                      className={`${isMobile ? "text-lg" : "mr-3 text-sm"}`}
                    />
                    <span className={`${isMobile ? "hidden" : ""}`}>
                      {category.name}
                      {category.count > 0 && ` (+${category.count})`}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center p-4 border-b border-discord-dark-500">
            <h3 className="text-white text-lg font-semibold">
              {categories.find((c) => c.id === activeTab)?.name}
            </h3>
            <button
              onClick={onClose}
              className="text-discord-text-muted hover:text-white"
            >
              <FaTimes />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Conditionally render based on active tab */}
            {activeTab !== "general" && activeTab !== "settings" ? (
              <>
                {/* Add new mask */}
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newMask}
                    onChange={(e) => setNewMask(e.target.value)}
                    placeholder={`Add ${activeTab === "b" ? "ban" : activeTab === "e" ? "exception" : "invitation"} mask (e.g., nick!*@*, *!*@host.com)`}
                    className="flex-1 p-2 bg-discord-dark-300 text-white rounded text-sm"
                  />
                  <button
                    onClick={() =>
                      newMask.trim() && addMode(activeTab, newMask.trim())
                    }
                    disabled={!newMask.trim() || isAdding}
                    className="px-3 py-2 bg-discord-primary hover:bg-opacity-80 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAdding ? (
                      <FaSpinner className="animate-spin" size={14} />
                    ) : (
                      <FaPlus size={14} />
                    )}
                  </button>
                </div>

                {/* Mode list */}
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="text-center text-discord-text-muted py-8">
                      Loading channel modes...
                    </div>
                  ) : filteredModes.length === 0 ? (
                    <div className="text-center text-discord-text-muted py-8">
                      No{" "}
                      {activeTab === "b"
                        ? "bans"
                        : activeTab === "e"
                          ? "ban exceptions"
                          : "invitations"}{" "}
                      found
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredModes.map((mode, index) => (
                        <div
                          key={`${mode.type}-${mode.mask}-${index}`}
                          className="flex items-center justify-between p-3 bg-discord-dark-300 rounded"
                        >
                          <div className="flex-1 min-w-0">
                            {editingMask === mode.mask ? (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full p-1 bg-discord-dark-400 text-white rounded text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    saveEdit(mode.mask, editValue);
                                  } else if (e.key === "Escape") {
                                    cancelEditing();
                                  }
                                }}
                              />
                            ) : (
                              <div className="text-white text-sm break-all">
                                {mode.mask}
                                <div className="text-discord-text-muted text-xs mt-1">
                                  {mode.setter && `set by ${mode.setter}`}
                                  {mode.setter && mode.timestamp && " • "}
                                  {mode.timestamp &&
                                    new Date(
                                      mode.timestamp * 1000,
                                    ).toLocaleString()}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            {editingMask === mode.mask ? (
                              <>
                                <button
                                  onClick={() => saveEdit(mode.mask, editValue)}
                                  className="text-green-400 hover:text-green-300"
                                  title="Save"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={cancelEditing}
                                  className="text-red-400 hover:text-red-300"
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditing(mode.mask)}
                                  className="text-discord-text-muted hover:text-white"
                                  title="Edit"
                                >
                                  <FaEdit size={14} />
                                </button>
                                <button
                                  onClick={() =>
                                    removeMode(mode.type, mode.mask)
                                  }
                                  className="text-red-400 hover:text-red-300"
                                  title="Remove"
                                  disabled={removingMasks.has(mode.mask)}
                                >
                                  {removingMasks.has(mode.mask) ? (
                                    <FaSpinner
                                      className="animate-spin"
                                      size={14}
                                    />
                                  ) : (
                                    <FaTrash size={14} />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-discord-dark-400">
                  <div className="text-xs text-discord-text-muted">
                    Use wildcards: * matches any sequence, ? matches any single
                    character. Examples: nick!*@*, *!*@host.com, *!*user@*
                  </div>
                </div>
              </>
            ) : activeTab === "general" ? (
              <>
                {/* General tab content */}
                <div className="flex-1 overflow-y-auto space-y-6">
                  {/* Channel Topic */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">
                      Channel Topic
                    </label>
                    <p className="text-xs text-discord-text-muted mb-2">
                      The topic that will be displayed for this channel. All
                      users can see the topic.
                    </p>
                    <input
                      type="text"
                      value={channelTopic}
                      onChange={(e) => setChannelTopic(e.target.value)}
                      placeholder="Welcome to the channel!"
                      className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
                    />
                  </div>

                  {/* Channel Avatar */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">
                      Channel Avatar
                    </label>
                    <p className="text-xs text-discord-text-muted mb-2">
                      {server?.filehost
                        ? "Upload an image or provide a URL with optional {size} substitution for dynamic sizing"
                        : "URL with optional {size} substitution for dynamic sizing. Example: https://example.com/avatar/{size}/channel.jpg"}
                    </p>
                    {server?.filehost ? (
                      <AvatarUpload
                        currentAvatarUrl={channelAvatar}
                        onAvatarUrlChange={setChannelAvatar}
                        serverId={serverId}
                        channelName={channelName}
                      />
                    ) : (
                      <>
                        <input
                          type="text"
                          value={channelAvatar}
                          onChange={(e) => setChannelAvatar(e.target.value)}
                          placeholder="https://example.com/avatar/{size}/channel.jpg"
                          className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
                        />
                        {channelAvatar && (
                          <div className="mt-2">
                            <p className="text-xs text-discord-text-muted mb-1">
                              Preview:
                            </p>
                            <img
                              src={channelAvatar.replace("{size}", "64")}
                              alt="Channel avatar preview"
                              className="w-16 h-16 rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Channel Display Name */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">
                      Channel Display Name
                    </label>
                    <p className="text-xs text-discord-text-muted mb-2">
                      Alternative name for display in the UI. May contain
                      spaces, emoji, and special characters. The real channel
                      name ({channelName}) will still be used for IRC commands.
                    </p>
                    <input
                      type="text"
                      value={channelDisplayName}
                      onChange={(e) => setChannelDisplayName(e.target.value)}
                      placeholder="General Support Channel"
                      className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
                    />
                  </div>

                  <div className="pt-4 border-t border-discord-dark-400">
                    <p className="text-xs text-discord-text-muted">
                      Note: Channel metadata requires operator (@) or higher
                      permissions to modify. Changes will be visible to all
                      users who support the METADATA specification.
                    </p>
                  </div>
                </div>

                {/* Apply button for General tab */}
                <div className="mt-4 pt-4 border-t border-discord-dark-400 flex justify-end">
                  <button
                    onClick={applyGeneralChanges}
                    disabled={isApplyingChanges}
                    className="px-6 py-2 bg-discord-primary hover:bg-opacity-80 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {isApplyingChanges ? (
                      <span className="flex items-center gap-2">
                        <FaSpinner className="animate-spin" size={14} />
                        Applying...
                      </span>
                    ) : (
                      "Apply"
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Settings tab content */}
                <div className="flex-1 overflow-y-auto space-y-6">
                  {/* Placeholder content for Settings tab */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">
                      Channel Settings
                    </label>
                    <p className="text-xs text-discord-text-muted mb-2">
                      Additional channel configuration options will be available
                      here.
                    </p>
                    <div className="text-center text-discord-text-muted py-8">
                      Settings content coming soon...
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ChannelSettingsModal;
