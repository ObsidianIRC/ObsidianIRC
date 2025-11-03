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
import FloodSettingsModal from "./FloodSettingsModal";

interface FloodRule {
  amount: number;
  type: "c" | "j" | "k" | "m" | "n" | "t" | "r";
  action?: string;
  time?: number; // in minutes
}

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
  const originalModesRef = useRef<{ [key: string]: string | null }>({});
  const [activeTab, setActiveTab] = useState<
    "b" | "e" | "I" | "general" | "settings" | "advanced"
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

  // Flood settings modal state
  const [isFloodModalOpen, setIsFloodModalOpen] = useState(false);
  const [floodProfile, setFloodProfile] = useState("");
  const [floodParams, setFloodParams] = useState("");

  // Standard IRC channel modes state
  const [clientLimit, setClientLimit] = useState<number | null>(null);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [channelKey, setChannelKey] = useState("");
  const [moderated, setModerated] = useState(false);
  const [secret, setSecret] = useState(false);
  const [protectedTopic, setProtectedTopic] = useState(false);
  const [noExternalMessages, setNoExternalMessages] = useState(false);

  // UnrealIRCd-specific modes state
  const [blockColorCodes, setBlockColorCodes] = useState(false);
  const [noCTCPs, setNoCTCPs] = useState(false);
  const [delayJoins, setDelayJoins] = useState(false);
  const [filterBadWords, setFilterBadWords] = useState(false);
  const [channelHistory, setChannelHistory] = useState("");
  const [noKnocks, setNoKnocks] = useState(false);
  const [channelLink, setChannelLink] = useState("");
  const [registeredNickRequired, setRegisteredNickRequired] = useState(false);
  const [noNickChanges, setNoNickChanges] = useState(false);
  const [ircOperatorOnly, setIrcOperatorOnly] = useState(false);
  const [privateChannel, setPrivateChannel] = useState(false);
  const [permanentChannel, setPermanentChannel] = useState(false);
  const [noKicks, setNoKicks] = useState(false);
  const [registeredUsersOnly, setRegisteredUsersOnly] = useState(false);
  const [stripColorCodes, setStripColorCodes] = useState(false);
  const [noNotices, setNoNotices] = useState(false);
  const [noInvites, setNoInvites] = useState(false);
  const [secureConnectionRequired, setSecureConnectionRequired] =
    useState(false);

  // Handle flood settings save
  const handleFloodSettingsSave = useCallback(
    (newFloodProfile: string, floodRules: FloodRule[], seconds: number) => {
      setFloodProfile(newFloodProfile);
      // Format flood rules back to parameter string
      const rulesString = floodRules
        .map(
          (rule) =>
            `${rule.amount}${rule.type}${rule.action ? `#${rule.action}` : ""}${rule.time ? `:${rule.time}` : ""}`,
        )
        .join(",");
      const paramsString = rulesString
        ? `[${rulesString}]:${seconds}`
        : "Default";
      setFloodParams(paramsString);
      setIsFloodModalOpen(false);
    },
    [],
  );

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
    ...(userHasOpPermission && server?.isUnrealIRCd
      ? [{ id: "advanced" as const, name: "Advanced", icon: FaCog, count: 0 }]
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

    setModes(parsedModes);
    isParsingRef.current = false;
  }, []);

  // Function to parse current channel modes using CHANMODES
  const parseCurrentChannelModes = useCallback(
    (modestring: string, modeargs: string[], chanmodes?: string) => {
      // Parse CHANMODES to determine mode groups
      const modeGroups = chanmodes ? chanmodes.split(",") : [];
      const groupA = modeGroups[0] || ""; // Always require param
      const groupB = modeGroups[1] || ""; // Always require param
      const groupC = modeGroups[2] || ""; // Require param only when setting
      const groupD = modeGroups[3] || ""; // Never require param

      const parsedModes: { [key: string]: string | null } = {};
      let argIndex = 0;
      let currentAction: "+" | "-" = "+";

      // Parse the modestring as a MODE command, applying + and - to build final state
      for (let i = 0; i < modestring.length; i++) {
        const char = modestring[i];
        if (char === "+" || char === "-") {
          currentAction = char;
          continue;
        }

        const mode = char;

        // Determine if this mode should have a parameter
        let hasParam = false;
        if (groupA.includes(mode) || groupB.includes(mode)) {
          hasParam = true;
        } else if (groupC.includes(mode)) {
          hasParam = currentAction === "+";
        }

        const param =
          hasParam && argIndex < modeargs.length ? modeargs[argIndex++] : null;

        if (currentAction === "+") {
          parsedModes[mode] = param;
        } else {
          // Unsetting
          delete parsedModes[mode];
        }
      }

      return parsedModes;
    },
    [],
  );

  // Function to load current channel modes
  const loadCurrentChannelModes = useCallback(() => {
    const servers = useStore.getState().servers;
    const currentServer = servers.find((s) => s.id === serverId);
    const currentChannel = currentServer?.channels.find(
      (c) => c.name === channelName,
    );
    if (!currentChannel) return;

    // Get current modes from channel object
    const currentModes = currentChannel.modes || "";
    const modeArgs = currentChannel.modeArgs || [];

    // Parse modes using CHANMODES-aware logic
    const parsedModes = parseCurrentChannelModes(
      currentModes,
      modeArgs,
      currentServer?.chanmodes,
    );

    // Store original modes for comparison
    originalModesRef.current = parsedModes;

    // Set standard IRC modes
    setInviteOnly("i" in parsedModes);
    setModerated("m" in parsedModes);
    setSecret("s" in parsedModes);
    setProtectedTopic("t" in parsedModes);
    setNoExternalMessages("n" in parsedModes);

    // Set parameterized modes
    setChannelKey("k" in parsedModes ? parsedModes.k || "" : "");
    setClientLimit(
      "l" in parsedModes
        ? parsedModes.l
          ? Number.parseInt(parsedModes.l, 10)
          : null
        : null,
    );
    setFloodParams("f" in parsedModes ? parsedModes.f || "" : "");
    setChannelHistory("H" in parsedModes ? parsedModes.H || "" : "");
    setChannelLink("L" in parsedModes ? parsedModes.L || "" : "");
    setFloodProfile("F" in parsedModes ? parsedModes.F || "" : "");

    // Set UnrealIRCd-specific modes
    setBlockColorCodes("c" in parsedModes);
    setNoCTCPs("C" in parsedModes);
    setDelayJoins("D" in parsedModes);
    setFilterBadWords("G" in parsedModes);
    setNoKnocks("K" in parsedModes);
    setRegisteredNickRequired("M" in parsedModes);
    setNoNickChanges("N" in parsedModes);
    setIrcOperatorOnly("O" in parsedModes);
    setPrivateChannel("p" in parsedModes);
    setPermanentChannel("P" in parsedModes);
    setNoKicks("Q" in parsedModes);
    setRegisteredUsersOnly("R" in parsedModes);
    setStripColorCodes("S" in parsedModes);
    setNoNotices("T" in parsedModes);
    setNoInvites("V" in parsedModes);
    setSecureConnectionRequired("z" in parsedModes);
  }, [serverId, channelName, parseCurrentChannelModes]);

  const fetchChannelModes = useCallback(async () => {
    setLoading(true);
    try {
      // Clear existing mode lists
      clearLists();

      // Request channel modes from server
      await ircClient.sendRaw(serverId, `MODE ${channelName}`);

      // Request channel ban/exception/invite lists
      await ircClient.sendRaw(serverId, `MODE ${channelName} +b`);
      await ircClient.sendRaw(serverId, `MODE ${channelName} +e`);
      await ircClient.sendRaw(serverId, `MODE ${channelName} +I`);

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
          // Load current channel modes into state
          loadCurrentChannelModes();
        }
        setLoading(false);
      }, 1000); // Give some time for the responses
    } catch (error) {
      console.error("Failed to fetch channel modes:", error);
      setLoading(false);
    }
  }, [
    serverId,
    channelName,
    clearLists,
    loadCurrentChannelModes,
    parseChannelModes,
  ]);

  const addMode = async (type: "b" | "e" | "I", mask: string) => {
    setIsAdding(true);
    try {
      await ircClient.sendRaw(serverId, `MODE ${channelName} +${type} ${mask}`);
      setNewMask("");
      // Re-fetch the lists and modes after the change
      setTimeout(() => {
        clearLists();
        ircClient.sendRaw(serverId, `MODE ${channelName} +b`);
        ircClient.sendRaw(serverId, `MODE ${channelName} +e`);
        ircClient.sendRaw(serverId, `MODE ${channelName} +I`);

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
            loadCurrentChannelModes();
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
      // Re-fetch the lists and modes after the change
      setTimeout(() => {
        clearLists();
        ircClient.sendRaw(serverId, `MODE ${channelName} +b`);
        ircClient.sendRaw(serverId, `MODE ${channelName} +e`);
        ircClient.sendRaw(serverId, `MODE ${channelName} +I`);

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
            loadCurrentChannelModes();
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
      // Re-fetch the lists and modes after the change
      setTimeout(() => {
        clearLists();
        ircClient.sendRaw(serverId, `MODE ${channelName} +b`);
        ircClient.sendRaw(serverId, `MODE ${channelName} +e`);
        ircClient.sendRaw(serverId, `MODE ${channelName} +I`);

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
            loadCurrentChannelModes();
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
        await metadataSet(serverId, channelName, "avatar", channelAvatar || "");
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
          channelDisplayName || "",
        );
      }
    } finally {
      setIsApplyingChanges(false);
    }
  };

  // Handle applying settings tab changes
  const applySettingsChanges = async () => {
    setIsApplyingChanges(true);
    try {
      let setModes = "";
      let unsetModes = "";
      const setArgs: string[] = [];
      const unsetArgs: string[] = [];

      // Client limit (+l/-l) - compare with original state
      const currentLimit = clientLimit !== null ? clientLimit.toString() : null;
      const originalLimit = originalModesRef.current.l;
      if (currentLimit && currentLimit !== originalLimit) {
        setModes += "l";
        setArgs.push(currentLimit);
      } else if (!currentLimit && "l" in originalModesRef.current) {
        unsetModes += "l";
      }

      // Invite-only (+i/-i)
      if (inviteOnly && !("i" in originalModesRef.current)) {
        setModes += "i";
      } else if (!inviteOnly && "i" in originalModesRef.current) {
        unsetModes += "i";
      }

      // Channel key (+k/-k)
      if (
        channelKey.trim() &&
        channelKey.trim() !== originalModesRef.current.k
      ) {
        setModes += "k";
        setArgs.push(channelKey.trim());
      } else if (!channelKey.trim() && "k" in originalModesRef.current) {
        unsetModes += "k";
      }

      // Moderated (+m/-m)
      if (moderated && !("m" in originalModesRef.current)) {
        setModes += "m";
      } else if (!moderated && "m" in originalModesRef.current) {
        unsetModes += "m";
      }

      // Secret (+s/-s)
      if (secret && !("s" in originalModesRef.current)) {
        setModes += "s";
      } else if (!secret && "s" in originalModesRef.current) {
        unsetModes += "s";
      }

      // Protected topic (+t/-t)
      if (protectedTopic && !("t" in originalModesRef.current)) {
        setModes += "t";
      } else if (!protectedTopic && "t" in originalModesRef.current) {
        unsetModes += "t";
      }

      // No external messages (+n/-n)
      if (noExternalMessages && !("n" in originalModesRef.current)) {
        setModes += "n";
      } else if (!noExternalMessages && "n" in originalModesRef.current) {
        unsetModes += "n";
      }

      // Build the MODE command
      let modeCommand = `MODE ${channelName}`;
      let modesString = "";
      const allArgs: string[] = [];

      if (setModes) {
        modesString += `+${setModes}`;
        allArgs.push(...setArgs);
      }

      if (unsetModes) {
        modesString += `-${unsetModes}`;
        allArgs.push(...unsetArgs);
      }

      if (modesString) {
        modeCommand += ` ${modesString}`;
      }

      if (allArgs.length > 0) {
        modeCommand += ` ${allArgs.join(" ")}`;
      }

      // Send mode changes
      if (setModes || unsetModes) {
        await ircClient.sendRaw(serverId, modeCommand);
      }
    } finally {
      setIsApplyingChanges(false);
    }
  };

  // Handle applying advanced tab changes
  const applyAdvancedChanges = async () => {
    setIsApplyingChanges(true);
    try {
      if (!channel) return;

      const currentModes = channel.modes || "";
      let setModes = "";
      let unsetModes = "";
      const setArgs: string[] = [];
      const unsetArgs: string[] = [];

      // Helper function to check if a mode is currently set
      // const isModeSet = (mode: string) => currentModes.includes(mode);

      // Helper function to get current parameter for a mode
      // const getCurrentParam = (mode: string) => {
      //   const match = currentModes.match(new RegExp(`${mode} ([^\\s]+)`));
      //   return match ? match[1] : null;
      // };

      // Block color codes (+c/-c)
      if (blockColorCodes && !("c" in originalModesRef.current)) {
        setModes += "c";
      } else if (!blockColorCodes && "c" in originalModesRef.current) {
        unsetModes += "c";
      }

      // No CTCPs (+C/-C)
      if (noCTCPs && !("C" in originalModesRef.current)) {
        setModes += "C";
      } else if (!noCTCPs && "C" in originalModesRef.current) {
        unsetModes += "C";
      }

      // Delay joins (+D/-D)
      if (delayJoins && !("D" in originalModesRef.current)) {
        setModes += "D";
      } else if (!delayJoins && "D" in originalModesRef.current) {
        unsetModes += "D";
      }

      // Filter bad words (+G/-G)
      if (filterBadWords && !("G" in originalModesRef.current)) {
        setModes += "G";
      } else if (!filterBadWords && "G" in originalModesRef.current) {
        unsetModes += "G";
      }

      // Channel history (+H/-H)
      const currentHistory = originalModesRef.current.H;
      if (channelHistory.trim() && channelHistory.trim() !== currentHistory) {
        setModes += "H";
        setArgs.push(channelHistory.trim());
      } else if (!channelHistory.trim() && "H" in originalModesRef.current) {
        unsetModes += "H";
        unsetArgs.push("*");
      }

      // No knocks (+K/-K)
      if (noKnocks && !("K" in originalModesRef.current)) {
        setModes += "K";
      } else if (!noKnocks && "K" in originalModesRef.current) {
        unsetModes += "K";
      }

      // Channel link (+L/-L)
      const currentLink = originalModesRef.current.L;
      if (channelLink.trim() && channelLink.trim() !== currentLink) {
        setModes += "L";
        setArgs.push(channelLink.trim());
      } else if (!channelLink.trim() && "L" in originalModesRef.current) {
        unsetModes += "L";
        unsetArgs.push("*");
      }

      // Registered nick required (+M/-M)
      if (registeredNickRequired && !("M" in originalModesRef.current)) {
        setModes += "M";
      } else if (!registeredNickRequired && "M" in originalModesRef.current) {
        unsetModes += "M";
      }

      // No nick changes (+N/-N)
      if (noNickChanges && !("N" in originalModesRef.current)) {
        setModes += "N";
      } else if (!noNickChanges && "N" in originalModesRef.current) {
        unsetModes += "N";
      }

      // IRC operator only (+O/-O)
      if (ircOperatorOnly && !("O" in originalModesRef.current)) {
        setModes += "O";
      } else if (!ircOperatorOnly && "O" in originalModesRef.current) {
        unsetModes += "O";
      }

      // Private channel (+p/-p)
      if (privateChannel && !("p" in originalModesRef.current)) {
        setModes += "p";
      } else if (!privateChannel && "p" in originalModesRef.current) {
        unsetModes += "p";
      }

      // Permanent channel (+P/-P)
      if (permanentChannel && !("P" in originalModesRef.current)) {
        setModes += "P";
      } else if (!permanentChannel && "P" in originalModesRef.current) {
        unsetModes += "P";
      }

      // No kicks (+Q/-Q)
      if (noKicks && !("Q" in originalModesRef.current)) {
        setModes += "Q";
      } else if (!noKicks && "Q" in originalModesRef.current) {
        unsetModes += "Q";
      }

      // Registered users only (+R/-R)
      if (registeredUsersOnly && !("R" in originalModesRef.current)) {
        setModes += "R";
      } else if (!registeredUsersOnly && "R" in originalModesRef.current) {
        unsetModes += "R";
      }

      // Strip color codes (+S/-S)
      if (stripColorCodes && !("S" in originalModesRef.current)) {
        setModes += "S";
      } else if (!stripColorCodes && "S" in originalModesRef.current) {
        unsetModes += "S";
      }

      // No notices (+T/-T)
      if (noNotices && !("T" in originalModesRef.current)) {
        setModes += "T";
      } else if (!noNotices && "T" in originalModesRef.current) {
        unsetModes += "T";
      }

      // No invites (+V/-V)
      if (noInvites && !("V" in originalModesRef.current)) {
        setModes += "V";
      } else if (!noInvites && "V" in originalModesRef.current) {
        unsetModes += "V";
      }

      // Secure connection required (+z/-z)
      if (secureConnectionRequired && !("z" in originalModesRef.current)) {
        setModes += "z";
      } else if (!secureConnectionRequired && "z" in originalModesRef.current) {
        unsetModes += "z";
      }

      // Flood profile (+F/-F)
      const currentFloodProfile = originalModesRef.current.F;
      if (floodProfile && floodProfile !== currentFloodProfile) {
        setModes += "F";
        setArgs.push(floodProfile);
      } else if (!floodProfile && currentFloodProfile) {
        unsetModes += "F";
        unsetArgs.push("*");
      }

      // Flood parameters (+f/-f)
      const currentFloodParams = originalModesRef.current.f;
      if (
        floodParams &&
        floodParams !== "Default" &&
        floodParams !== currentFloodParams
      ) {
        setModes += "f";
        setArgs.push(floodParams);
      } else if (
        (!floodParams || floodParams === "Default") &&
        currentFloodParams
      ) {
        unsetModes += "f";
        unsetArgs.push("*");
      }

      // Build the MODE command
      let modeCommand = `MODE ${channelName}`;
      let modesString = "";
      const allArgs: string[] = [];

      if (setModes) {
        modesString += `+${setModes}`;
        allArgs.push(...setArgs);
      }

      if (unsetModes) {
        modesString += `-${unsetModes}`;
        allArgs.push(...unsetArgs);
      }

      if (modesString) {
        modeCommand += ` ${modesString}`;
      }

      if (allArgs.length > 0) {
        modeCommand += ` ${allArgs.join(" ")}`;
      }

      // Only send command if there are actual changes
      if (setModes || unsetModes) {
        await ircClient.sendRaw(serverId, modeCommand);
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

      // Load current channel modes
      loadCurrentChannelModes();
    }
  }, [isOpen, channel, loadCurrentChannelModes]);

  // Update local mode state when channel modes change (e.g., from MODE events)
  useEffect(() => {
    if (isOpen && channel) {
      loadCurrentChannelModes();
    }
  }, [isOpen, channel, loadCurrentChannelModes]);

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
                    <span
                      className={`${isMobile ? "hidden" : ""} flex items-center justify-between flex-1`}
                    >
                      <span>{category.name}</span>
                      {category.count > 0 && (
                        <span className="bg-discord-primary text-white text-xs px-2 py-0.5 rounded-full ml-2">
                          {category.count}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center p-4 border-b border-discord-dark-500 flex-shrink-0">
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

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6">
              {/* Conditionally render based on active tab */}
              {activeTab !== "general" &&
              activeTab !== "settings" &&
              activeTab !== "advanced" ? (
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
                                    onClick={() =>
                                      saveEdit(mode.mask, editValue)
                                    }
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
                      Use wildcards: * matches any sequence, ? matches any
                      single character. Examples: nick!*@*, *!*@host.com,
                      *!*user@*
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
                        name ({channelName}) will still be used for IRC
                        commands.
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
                </>
              ) : activeTab === "settings" ? (
                <>
                  {/* Settings tab content */}
                  <div className="flex-1 overflow-y-auto space-y-6">
                    {/* Client Limit */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">
                        Client Limit (+l)
                      </label>
                      <p className="text-xs text-discord-text-muted mb-2">
                        Maximum number of users allowed in the channel. Leave
                        empty for no limit.
                      </p>
                      <input
                        type="number"
                        value={clientLimit || ""}
                        onChange={(e) =>
                          setClientLimit(
                            e.target.value
                              ? Number.parseInt(e.target.value, 10)
                              : null,
                          )
                        }
                        placeholder="No limit"
                        min="1"
                        className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
                      />
                    </div>

                    {/* Invite-Only */}
                    <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">
                          Invite-Only (+i)
                        </label>
                        <p className="text-xs text-discord-text-muted mt-1">
                          Users must be invited to join the channel
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={inviteOnly}
                        onChange={(e) => setInviteOnly(e.target.checked)}
                        className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                      />
                    </div>

                    {/* Channel Key */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">
                        Channel Key (+k)
                      </label>
                      <p className="text-xs text-discord-text-muted mb-2">
                        Password required to join the channel. Leave empty to
                        remove the key.
                      </p>
                      <input
                        type="password"
                        value={channelKey}
                        onChange={(e) => setChannelKey(e.target.value)}
                        placeholder="No key"
                        className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
                      />
                    </div>

                    {/* Moderated */}
                    <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">
                          Moderated (+m)
                        </label>
                        <p className="text-xs text-discord-text-muted mt-1">
                          Only users with voice or higher can speak
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={moderated}
                        onChange={(e) => setModerated(e.target.checked)}
                        className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                      />
                    </div>

                    {/* Secret */}
                    <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">
                          Secret (+s)
                        </label>
                        <p className="text-xs text-discord-text-muted mt-1">
                          Channel won't appear in LIST or NAMES commands
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={secret}
                        onChange={(e) => setSecret(e.target.checked)}
                        className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                      />
                    </div>

                    {/* Protected Topic */}
                    <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">
                          Protected Topic (+t)
                        </label>
                        <p className="text-xs text-discord-text-muted mt-1">
                          Only operators can change the channel topic
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={protectedTopic}
                        onChange={(e) => setProtectedTopic(e.target.checked)}
                        className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                      />
                    </div>

                    {/* No External Messages */}
                    <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-white">
                          No External Messages (+n)
                        </label>
                        <p className="text-xs text-discord-text-muted mt-1">
                          Users outside the channel cannot send messages to it
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={noExternalMessages}
                        onChange={(e) =>
                          setNoExternalMessages(e.target.checked)
                        }
                        className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Advanced tab content */}
                  <div className="flex-1 overflow-y-auto space-y-6">
                    {/* Flood Protection Settings */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                          Flood Protection (+f)
                        </label>
                        <p className="text-xs text-discord-text-muted mb-2">
                          Configure flood protection rules to prevent spam and
                          abuse. UnrealIRCd-specific feature.
                        </p>
                      </div>

                      {/* Flood Profile Selection */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-discord-text-muted uppercase tracking-wide">
                          Flood Profile (+F)
                        </label>
                        <select
                          value={floodProfile}
                          onChange={(e) => setFloodProfile(e.target.value)}
                          className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
                        >
                          <option value="">No flood profile</option>
                          <option value="very-strict">Very Strict</option>
                          <option value="strict">Strict</option>
                          <option value="normal">Normal</option>
                          <option value="relaxed">Relaxed</option>
                          <option value="very-relaxed">Very Relaxed</option>
                        </select>
                      </div>

                      {/* Flood Parameters */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-discord-text-muted uppercase tracking-wide">
                          Flood Parameters
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={floodParams}
                            onChange={(e) => setFloodParams(e.target.value)}
                            placeholder="Default"
                            className="flex-1 p-2 bg-discord-dark-300 text-white rounded text-sm"
                          />
                          <button
                            onClick={() => setIsFloodModalOpen(true)}
                            className="px-3 py-2 bg-discord-primary hover:bg-opacity-80 text-white rounded text-sm font-medium"
                          >
                            Configure
                          </button>
                        </div>
                        <p className="text-xs text-discord-text-muted">
                          Use the Configure button for detailed flood rule
                          management, or enter parameters manually in the
                          format: [rules]:seconds
                        </p>
                      </div>
                    </div>

                    {/* Content Filtering */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-white">
                        Content Filtering
                      </h3>

                      {/* Block Color Codes */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Block Color Codes (+c)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Block messages containing mIRC color codes
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={blockColorCodes}
                          onChange={(e) => setBlockColorCodes(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* No CTCPs */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            No CTCPs (+C)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Block CTCP commands in the channel
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={noCTCPs}
                          onChange={(e) => setNoCTCPs(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* Filter Bad Words */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Filter Bad Words (+G)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Filter out bad words with &lt;censored&gt;
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={filterBadWords}
                          onChange={(e) => setFilterBadWords(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* Strip Color Codes */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Strip Color Codes (+S)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Strip mIRC color codes from messages
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={stripColorCodes}
                          onChange={(e) => setStripColorCodes(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>
                    </div>

                    {/* Channel Behavior */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-white">
                        Channel Behavior
                      </h3>

                      {/* Delay Joins */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Delay Joins (+D)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Delay showing joins until someone speaks
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={delayJoins}
                          onChange={(e) => setDelayJoins(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* No Knocks */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            No Knocks (+K)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            /KNOCK command is not allowed
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={noKnocks}
                          onChange={(e) => setNoKnocks(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* No Nick Changes */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            No Nick Changes (+N)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Nickname changes are not permitted
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={noNickChanges}
                          onChange={(e) => setNoNickChanges(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* No Kicks */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            No Kicks (+Q)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Kick commands are not allowed
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={noKicks}
                          onChange={(e) => setNoKicks(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* No Notices */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            No Notices (+T)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            NOTICE commands are not allowed
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={noNotices}
                          onChange={(e) => setNoNotices(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* No Invites */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            No Invites (+V)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            /INVITE command is not allowed
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={noInvites}
                          onChange={(e) => setNoInvites(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>
                    </div>

                    {/* Access Control */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-white">
                        Access Control
                      </h3>

                      {/* Registered Nick Required */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Registered Nick Required (+M)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Users must have a registered nickname (+r) to talk
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={registeredNickRequired}
                          onChange={(e) =>
                            setRegisteredNickRequired(e.target.checked)
                          }
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* Registered Users Only */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Registered Users Only (+R)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Only registered users (+r) may join
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={registeredUsersOnly}
                          onChange={(e) =>
                            setRegisteredUsersOnly(e.target.checked)
                          }
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* IRC Operator Only */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            IRC Operator Only (+O)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Only IRC operators can join (settable by IRCops)
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={ircOperatorOnly}
                          onChange={(e) => setIrcOperatorOnly(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* Secure Connection Required */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Secure Connection Required (+z)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Only clients on secure connections (SSL/TLS) can
                            join
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={secureConnectionRequired}
                          onChange={(e) =>
                            setSecureConnectionRequired(e.target.checked)
                          }
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>
                    </div>

                    {/* Channel Properties */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-white">
                        Channel Properties
                      </h3>

                      {/* Private Channel */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Private Channel (+p)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Channel is marked as private
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={privateChannel}
                          onChange={(e) => setPrivateChannel(e.target.checked)}
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* Permanent Channel */}
                      <div className="flex items-center justify-between p-3 bg-discord-dark-300 rounded">
                        <div className="flex-1">
                          <label className="text-sm font-medium text-white">
                            Permanent Channel (+P)
                          </label>
                          <p className="text-xs text-discord-text-muted mt-1">
                            Channel won't be destroyed when empty (settable by
                            IRCops)
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={permanentChannel}
                          onChange={(e) =>
                            setPermanentChannel(e.target.checked)
                          }
                          className="w-4 h-4 text-discord-primary bg-discord-dark-300 border-discord-dark-500 rounded focus:ring-discord-primary"
                        />
                      </div>

                      {/* Channel History */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                          Channel History (+H)
                        </label>
                        <p className="text-xs text-discord-text-muted mb-2">
                          Record channel history with max-lines:max-minutes.
                          Leave empty to disable.
                        </p>
                        <input
                          type="text"
                          value={channelHistory}
                          onChange={(e) => setChannelHistory(e.target.value)}
                          placeholder="e.g., 100:1440"
                          className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
                        />
                      </div>

                      {/* Channel Link */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                          Channel Link (+L)
                        </label>
                        <p className="text-xs text-discord-text-muted mb-2">
                          Forward users to this channel if they can't join.
                          Leave empty to disable.
                        </p>
                        <input
                          type="text"
                          value={channelLink}
                          onChange={(e) => setChannelLink(e.target.value)}
                          placeholder="#overflow"
                          className="w-full p-2 bg-discord-dark-300 text-white rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Apply buttons at bottom */}
            <div className="flex-shrink-0 p-6 border-t border-discord-dark-500 bg-discord-dark-200">
              <div className="flex justify-end">
                {activeTab === "general" && (
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
                )}
                {activeTab === "settings" && (
                  <button
                    onClick={applySettingsChanges}
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
                )}
                {activeTab === "advanced" && (
                  <button
                    onClick={applyAdvancedChanges}
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
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flood Settings Modal */}
      <FloodSettingsModal
        isOpen={isFloodModalOpen}
        onClose={() => setIsFloodModalOpen(false)}
        onSave={handleFloodSettingsSave}
        initialFloodProfile={floodProfile}
        initialFloodParams={floodParams}
      />
    </div>,
    document.body,
  );
};

export default ChannelSettingsModal;
