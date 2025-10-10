import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaEdit, FaPlus, FaSpinner, FaTimes, FaTrash } from "react-icons/fa";
import ircClient from "../../lib/ircClient";
import { hasOpPermission } from "../../lib/ircUtils";
import useStore, { serverSupportsMetadata } from "../../store";
import type { Channel } from "../../types";

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
  const [activeTab, setActiveTab] = useState<"b" | "e" | "I" | "metadata">("b");
  const [newMask, setNewMask] = useState("");
  const [editingMask, setEditingMask] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingMasks, setRemovingMasks] = useState(new Set<string>());

  // Metadata state
  const [channelAvatar, setChannelAvatar] = useState("");
  const [channelDisplayName, setChannelDisplayName] = useState("");
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false);

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
    }
  }, [isOpen, channel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-2xl p-6 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">
            Channel Settings - {channelName}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-discord-dark-400 mb-4">
          <button
            onClick={() => setActiveTab("b")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "b"
                ? "text-white border-b-2 border-discord-blue"
                : "text-discord-text-muted hover:text-white"
            }`}
          >
            Bans (+b){" "}
            {modes.filter((m) => m.type === "b").length > 0 &&
              `(${modes.filter((m) => m.type === "b").length})`}
          </button>
          <button
            onClick={() => setActiveTab("e")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "e"
                ? "text-white border-b-2 border-discord-blue"
                : "text-discord-text-muted hover:text-white"
            }`}
          >
            Ban Exceptions (+e){" "}
            {modes.filter((m) => m.type === "e").length > 0 &&
              `(${modes.filter((m) => m.type === "e").length})`}
          </button>
          <button
            onClick={() => setActiveTab("I")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "I"
                ? "text-white border-b-2 border-discord-blue"
                : "text-discord-text-muted hover:text-white"
            }`}
          >
            Invitations (+I){" "}
            {modes.filter((m) => m.type === "I").length > 0 &&
              `(${modes.filter((m) => m.type === "I").length})`}
          </button>
          {userHasOpPermission && supportsMetadata && (
            <button
              onClick={() => setActiveTab("metadata")}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "metadata"
                  ? "text-white border-b-2 border-discord-blue"
                  : "text-discord-text-muted hover:text-white"
              }`}
            >
              Metadata
            </button>
          )}
        </div>

        {/* Conditionally render based on active tab */}
        {activeTab !== "metadata" ? (
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
                              onClick={() => removeMode(mode.type, mode.mask)}
                              className="text-red-400 hover:text-red-300"
                              title="Remove"
                              disabled={removingMasks.has(mode.mask)}
                            >
                              {removingMasks.has(mode.mask) ? (
                                <FaSpinner className="animate-spin" size={14} />
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
        ) : (
          <>
            {/* Metadata tab content */}
            <div className="flex-1 overflow-y-auto space-y-6">
              {/* Channel Avatar */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Channel Avatar URL
                </label>
                <p className="text-xs text-discord-text-muted mb-2">
                  URL with optional &#123;size&#125; substitution for dynamic
                  sizing. Example:
                  https://example.com/avatar/&#123;size&#125;/channel.jpg
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={channelAvatar}
                    onChange={(e) => setChannelAvatar(e.target.value)}
                    placeholder="https://example.com/avatar/{size}/channel.jpg"
                    className="flex-1 p-2 bg-discord-dark-300 text-white rounded text-sm"
                  />
                  <button
                    onClick={async () => {
                      setIsUpdatingAvatar(true);
                      try {
                        await metadataSet(
                          serverId,
                          channelName,
                          "avatar",
                          channelAvatar || undefined,
                        );
                      } finally {
                        setIsUpdatingAvatar(false);
                      }
                    }}
                    disabled={isUpdatingAvatar}
                    className="px-4 py-2 bg-discord-primary hover:bg-opacity-80 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isUpdatingAvatar ? (
                      <FaSpinner className="animate-spin" size={14} />
                    ) : (
                      "Apply"
                    )}
                  </button>
                </div>
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
              </div>

              {/* Channel Display Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">
                  Channel Display Name
                </label>
                <p className="text-xs text-discord-text-muted mb-2">
                  Alternative name for display in the UI. May contain spaces,
                  emoji, and special characters. The real channel name (
                  {channelName}) will still be used for IRC commands.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={channelDisplayName}
                    onChange={(e) => setChannelDisplayName(e.target.value)}
                    placeholder="General Support Channel"
                    className="flex-1 p-2 bg-discord-dark-300 text-white rounded text-sm"
                  />
                  <button
                    onClick={async () => {
                      setIsUpdatingDisplayName(true);
                      try {
                        await metadataSet(
                          serverId,
                          channelName,
                          "display-name",
                          channelDisplayName || undefined,
                        );
                      } finally {
                        setIsUpdatingDisplayName(false);
                      }
                    }}
                    disabled={isUpdatingDisplayName}
                    className="px-4 py-2 bg-discord-primary hover:bg-opacity-80 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isUpdatingDisplayName ? (
                      <FaSpinner className="animate-spin" size={14} />
                    ) : (
                      "Apply"
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-discord-dark-400">
                <p className="text-xs text-discord-text-muted">
                  Note: Channel metadata requires operator (@) or higher
                  permissions to modify. Changes will be visible to all users
                  who support the METADATA specification.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChannelSettingsModal;
