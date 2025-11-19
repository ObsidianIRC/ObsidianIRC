import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaBell,
  FaCog,
  FaImage,
  FaServer,
  FaTimes,
  FaUser,
} from "react-icons/fa";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import ircClient from "../../lib/ircClient";
import { settingsRegistry } from "../../lib/settings";
import type { SettingValue } from "../../lib/settings/types";
import useStore, {
  loadSavedServers,
  serverSupportsMetadata,
} from "../../store";
import AvatarUpload from "./AvatarUpload";
import { SettingField } from "./settings/SettingRenderer";
import UserProfileModal from "./UserProfileModal";

// Deep clone utility for settings values
const deepClone = <T,>(value: T): T => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  const cloned: Record<string, unknown> = {};
  for (const key in value) {
    if (Object.hasOwn(value, key)) {
      cloned[key] = deepClone((value as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
};

// Deep equality check for comparing setting values
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  return false;
};

type SettingsCategory =
  | "profile"
  | "notifications"
  | "preferences"
  | "media"
  | "account";

interface CategoryInfo {
  id: SettingsCategory;
  title: string;
  icon: React.ReactNode;
  description: string;
}

const categories: CategoryInfo[] = [
  {
    id: "profile",
    title: "Profile",
    icon: <FaUser className="w-5 h-5" />,
    description: "Manage your profile information and metadata",
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: <FaBell className="w-5 h-5" />,
    description: "Configure notification sounds and highlights",
  },
  {
    id: "preferences",
    title: "Preferences",
    icon: <FaCog className="w-5 h-5" />,
    description: "Customize your IRC client experience",
  },
  {
    id: "media",
    title: "Media",
    icon: <FaImage className="w-5 h-5" />,
    description: "Control media display and external content",
  },
  {
    id: "account",
    title: "Account",
    icon: <FaServer className="w-5 h-5" />,
    description: "Manage your account and authentication",
  },
];

export const UserSettings: React.FC = React.memo(() => {
  const {
    toggleSettingsModal,
    setProfileViewRequest,
    clearSettingsNavigation,
    servers,
    ui,
    isConnecting,
    metadataSet,
    sendRaw,
    setName,
    changeNick,
    updateServer,
    globalSettings,
    updateGlobalSettings,
    addToIgnoreList,
    removeFromIgnoreList,
  } = useStore();

  const currentServer = useMemo(
    () => servers.find((s) => s.id === ui.selectedServerId),
    [servers, ui.selectedServerId],
  );

  const savedServers = loadSavedServers();
  const serverConfig = savedServers.find((s) => s.id === ui.selectedServerId);

  const currentUser = useMemo(() => {
    if (!currentServer) return null;

    const ircCurrentUser = ircClient.getCurrentUser(currentServer.id);
    if (!ircCurrentUser) return null;

    for (const channel of currentServer.channels) {
      const userWithMetadata = channel.users.find(
        (u) => u.username === ircCurrentUser.username,
      );
      if (userWithMetadata) {
        return userWithMetadata;
      }
    }

    return ircCurrentUser;
  }, [currentServer]);

  const supportsMetadata = useMemo(
    () => (currentServer ? serverSupportsMetadata(currentServer.id) : false),
    [currentServer],
  );
  const isHostedChatMode = __HIDE_SERVER_LIST__;
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Category state
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("profile");
  const [highlightedSetting, setHighlightedSetting] = useState<string | null>(
    null,
  );

  // Refs to store timeout IDs to prevent premature clearing
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear highlight when modal closes
  useEffect(() => {
    if (!ui.isSettingsModalOpen) {
      setHighlightedSetting(null);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    }
  }, [ui.isSettingsModalOpen]);

  // Apply navigation from Quick Actions
  useEffect(() => {
    if (!ui.settingsNavigation) return;

    if (ui.settingsNavigation.category) {
      setActiveCategory(ui.settingsNavigation.category);
    }

    if (ui.settingsNavigation.highlightedSettingId) {
      const settingId = ui.settingsNavigation.highlightedSettingId;
      setHighlightedSetting(settingId);

      // Clear any existing timeouts
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Scroll to the highlighted element after a brief delay
      scrollTimeoutRef.current = setTimeout(() => {
        const element = document.getElementById(`setting-${settingId}`);
        if (element) {
          // Find the scrollable container
          const scrollContainer = element.closest(".overflow-y-auto");
          if (scrollContainer) {
            // Scroll within the container
            const elementTop = element.offsetTop;
            const containerHeight = scrollContainer.clientHeight;
            const scrollTo =
              elementTop - containerHeight / 2 + element.clientHeight / 2;
            scrollContainer.scrollTo({ top: scrollTo, behavior: "smooth" });
          } else {
            // Fallback to normal scrollIntoView
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
        scrollTimeoutRef.current = null;
      }, 200);

      // Clear highlight after 2 seconds
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedSetting(null);
        highlightTimeoutRef.current = null;
      }, 2000);

      // Clear navigation state
      clearSettingsNavigation();
    } else {
      // Clear navigation state if no highlighted setting
      clearSettingsNavigation();
    }
  }, [ui.settingsNavigation, clearSettingsNavigation]);

  // User Profile Modal state
  const [viewProfileModalOpen, setViewProfileModalOpen] = useState(false);
  const [showExternalContentWarning, setShowExternalContentWarning] =
    useState(false);

  // Profile metadata state
  const [avatar, setAvatar] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [realname, setRealname] = useState("");
  const [homepage, setHomepage] = useState("");
  const [status, setStatus] = useState("");
  const [color, setColor] = useState("");
  const [bot, setBot] = useState("");

  // Settings state - consolidated
  const [settings, setSettings] = useState<Record<string, SettingValue>>({});

  // Account state
  const [newNickname, setNewNickname] = useState(currentUser?.username || "");
  const [operName, setOperName] = useState(serverConfig?.operUsername || "");
  const [operPassword, setOperPassword] = useState("");
  const [operOnConnect, setOperOnConnect] = useState(
    serverConfig?.operOnConnect || false,
  );

  // Original values for change tracking
  const [originalValues, setOriginalValues] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Notification sound file
  const [notificationSoundFile, setNotificationSoundFile] =
    useState<File | null>(null);

  // Refs for input fields
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const botInputRef = useRef<HTMLInputElement>(null);
  const realnameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track if we've initialized for this modal open
  const initializedRef = useRef(false);

  // Initialize settings from global state and current user metadata
  useEffect(() => {
    if (!ui.isSettingsModalOpen) {
      initializedRef.current = false;
      return;
    }

    // Only initialize once per modal open
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialSettings: Record<string, SettingValue> = {
      ...globalSettings,
    };

    setSettings(initialSettings);

    // Initialize profile metadata if metadata is supported
    let initialAvatar = "";
    let initialDisplayName = "";
    let initialRealname = "";
    let initialHomepage = "";
    let initialStatus = "";
    let initialColor = "";
    let initialBot = "";

    if (currentUser && supportsMetadata) {
      const meta = currentUser.metadata || {};
      initialAvatar =
        typeof meta.avatar === "object"
          ? meta.avatar.value || ""
          : meta.avatar || "";
      initialDisplayName =
        typeof meta["display-name"] === "object"
          ? meta["display-name"].value || ""
          : meta["display-name"] || "";
      initialRealname =
        typeof meta.realname === "object"
          ? meta.realname.value || ""
          : meta.realname || "";
      initialHomepage =
        typeof meta.homepage === "object"
          ? meta.homepage.value || ""
          : meta.homepage || "";
      initialStatus =
        typeof meta.status === "object"
          ? meta.status.value || ""
          : meta.status || "";
      initialColor =
        typeof meta.color === "object"
          ? meta.color.value || ""
          : meta.color || "";
      initialBot =
        typeof meta.bot === "object" ? meta.bot.value || "" : meta.bot || "";

      setAvatar(initialAvatar);
      setDisplayName(initialDisplayName);
      setRealname(initialRealname);
      setHomepage(initialHomepage);
      setStatus(initialStatus);
      setColor(initialColor);
      setBot(initialBot);
    }

    const initialNickname = currentUser?.username || "";
    setNewNickname(initialNickname);

    const initialOperName = serverConfig?.operUsername || "";
    const initialOperPassword = "";
    const initialOperOnConnect = serverConfig?.operOnConnect || false;
    setOperName(initialOperName);
    setOperPassword(initialOperPassword);
    setOperOnConnect(initialOperOnConnect);

    // Store original values for change tracking (deep clone to avoid reference issues)
    setOriginalValues({
      ...deepClone(initialSettings),
      avatar: initialAvatar,
      displayName: initialDisplayName,
      realname: initialRealname,
      homepage: initialHomepage,
      status: initialStatus,
      color: initialColor,
      bot: initialBot,
      newNickname: initialNickname,
      operName: initialOperName,
      operPassword: initialOperPassword,
      operOnConnect: initialOperOnConnect,
    });
  }, [
    ui.isSettingsModalOpen,
    currentUser,
    supportsMetadata,
    globalSettings,
    serverConfig,
  ]);

  // Track if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!originalValues) return false;

    // Check profile metadata
    if (
      avatar !== originalValues.avatar ||
      displayName !== originalValues.displayName ||
      realname !== originalValues.realname ||
      homepage !== originalValues.homepage ||
      status !== originalValues.status ||
      color !== originalValues.color ||
      bot !== originalValues.bot ||
      newNickname !== originalValues.newNickname ||
      operName !== originalValues.operName ||
      operPassword !== originalValues.operPassword ||
      operOnConnect !== originalValues.operOnConnect
    ) {
      return true;
    }

    // Check settings using deep equality
    for (const [key, value] of Object.entries(settings)) {
      if (!deepEqual(originalValues[key], value)) {
        return true;
      }
    }

    return false;
  }, [
    originalValues,
    settings,
    avatar,
    displayName,
    realname,
    homepage,
    status,
    color,
    bot,
    newNickname,
    operName,
    operPassword,
    operOnConnect,
  ]);

  // Setting change handler
  const handleSettingChange = useCallback(
    (settingId: string, value: SettingValue) => {
      setSettings((prev) => ({
        ...prev,
        [settingId]: value,
      }));
    },
    [],
  );

  // Profile field change handlers
  const handleAvatarChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAvatar(e.target.value);
      setTimeout(() => {
        if (document.activeElement !== avatarInputRef.current) {
          avatarInputRef.current?.focus();
        }
      }, 0);
    },
    [],
  );

  const handleAvatarUrlChange = useCallback((url: string) => {
    setAvatar(url);
  }, []);

  const handleDisplayNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDisplayName(e.target.value);
      setTimeout(() => {
        if (document.activeElement !== displayNameInputRef.current) {
          displayNameInputRef.current?.focus();
        }
      }, 0);
    },
    [],
  );

  const handleRealnameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRealname(e.target.value);
      setTimeout(() => {
        if (document.activeElement !== realnameInputRef.current) {
          realnameInputRef.current?.focus();
        }
      }, 0);
    },
    [],
  );

  const handleHomepageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setHomepage(e.target.value);
    },
    [],
  );

  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setStatus(e.target.value);
      setTimeout(() => {
        if (document.activeElement !== statusInputRef.current) {
          statusInputRef.current?.focus();
        }
      }, 0);
    },
    [],
  );

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setColor(e.target.value);
      setTimeout(() => {
        if (document.activeElement !== colorInputRef.current) {
          colorInputRef.current?.focus();
        }
      }, 0);
    },
    [],
  );

  const handleBotChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBot(e.target.value);
      setTimeout(() => {
        if (document.activeElement !== botInputRef.current) {
          botInputRef.current?.focus();
        }
      }, 0);
    },
    [],
  );

  const handleNewNicknameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewNickname(e.target.value);
      setTimeout(() => {
        if (document.activeElement !== nicknameInputRef.current) {
          nicknameInputRef.current?.focus();
        }
      }, 0);
    },
    [],
  );

  const handleOperUp = () => {
    if (operName.trim() && operPassword.trim() && currentServer) {
      sendRaw(
        currentServer.id,
        `OPER ${operName.trim()} ${operPassword.trim()}`,
      );
    }
  };

  // Audio playback utility
  const playNotificationSound = async (soundFile?: File | string | null) => {
    try {
      if (!soundFile) return;

      let audioUrl: string;

      if (typeof soundFile === "string") {
        audioUrl = soundFile;
      } else {
        audioUrl = URL.createObjectURL(soundFile);
      }

      const audio = new Audio(audioUrl);
      await audio.play();

      if (typeof soundFile !== "string") {
        setTimeout(() => URL.revokeObjectURL(audioUrl), 1000);
      }
    } catch (error) {
      console.error("Failed to play notification sound:", error);
    }
  };

  // Handle save
  const handleSave = useCallback(async () => {
    if (!currentServer) return;

    // Save profile metadata
    if (supportsMetadata) {
      const metadata: Record<string, string> = {};
      if (avatar) metadata.avatar = avatar;
      if (displayName) metadata["display-name"] = displayName;
      if (realname) metadata.realname = realname;
      if (homepage) metadata.homepage = homepage;
      if (status) metadata.status = status;
      if (color) metadata.color = color;
      if (bot) metadata.bot = bot;

      for (const [key, value] of Object.entries(metadata)) {
        sendRaw(currentServer.id, `METADATA * SET ${key} :${value}`);
      }
    }

    // Handle nickname change
    if (newNickname && newNickname !== currentUser?.username) {
      changeNick(currentServer.id, newNickname);
    }

    // Save global settings
    updateGlobalSettings(settings);

    // Save notification sound file
    if (notificationSoundFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        updateGlobalSettings({ notificationSound: dataUrl });
      };
      reader.readAsDataURL(notificationSoundFile);
    }

    // Save oper settings if in hosted chat mode
    if (isHostedChatMode && serverConfig) {
      updateServer(serverConfig.id, {
        ...serverConfig,
        operUsername: operName,
        operOnConnect,
      });
    }

    // Reset original values
    setOriginalValues(null);
    toggleSettingsModal(false);
  }, [
    currentServer,
    supportsMetadata,
    avatar,
    displayName,
    realname,
    homepage,
    status,
    color,
    bot,
    newNickname,
    currentUser,
    settings,
    notificationSoundFile,
    isHostedChatMode,
    serverConfig,
    operName,
    operOnConnect,
    sendRaw,
    changeNick,
    updateGlobalSettings,
    updateServer,
    toggleSettingsModal,
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm(
        "You have unsaved changes. Are you sure you want to close without saving?",
      );
      if (!confirmClose) {
        return;
      }
    }
    setOriginalValues(null);
    toggleSettingsModal(false);
  }, [hasUnsavedChanges, toggleSettingsModal]);

  const { getBackdropProps, getContentProps } = useModalBehavior({
    onClose: handleClose,
    isOpen: ui.isSettingsModalOpen,
  });

  // Get settings for active category
  const categorySettings = useMemo(() => {
    return settingsRegistry.getByCategory(activeCategory);
  }, [activeCategory]);

  // Render profile metadata fields
  const renderProfileFields = () => {
    if (!supportsMetadata) {
      return (
        <div className="text-discord-text-muted text-sm italic">
          This server does not support metadata (IRCv3 METADATA extension).
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Nickname */}
        <div className="space-y-2">
          <label className="block text-discord-text-normal text-sm font-medium">
            Nickname
          </label>
          <p className="text-discord-text-muted text-xs">
            Your unique identifier on this server
          </p>
          <input
            ref={nicknameInputRef}
            type="text"
            value={newNickname}
            onChange={handleNewNicknameChange}
            className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
          />
        </div>

        {/* Display Name */}
        <div
          id="setting-profile.displayName"
          className={`space-y-2 p-4 rounded-lg transition-all duration-300 ${
            highlightedSetting === "profile.displayName"
              ? "bg-yellow-400/20 ring-2 ring-yellow-400"
              : ""
          }`}
        >
          <label className="block text-discord-text-normal text-sm font-medium">
            Display Name
          </label>
          <p className="text-discord-text-muted text-xs">
            Your preferred display name (metadata: display-name)
          </p>
          <input
            ref={displayNameInputRef}
            type="text"
            value={displayName}
            onChange={handleDisplayNameChange}
            placeholder="Enter display name"
            className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
          />
        </div>

        {/* Avatar */}
        <div
          id="setting-profile.avatar"
          className={`space-y-2 p-4 rounded-lg transition-all duration-300 ${
            highlightedSetting === "profile.avatar"
              ? "bg-yellow-400/20 ring-2 ring-yellow-400"
              : ""
          }`}
        >
          <label className="block text-discord-text-normal text-sm font-medium">
            Avatar URL
          </label>
          <p className="text-discord-text-muted text-xs">
            URL to your avatar image (metadata: avatar)
          </p>
          <input
            ref={avatarInputRef}
            type="text"
            value={avatar}
            onChange={handleAvatarChange}
            placeholder="https://example.com/avatar.png"
            className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
          />
          {currentServer && (
            <AvatarUpload
              currentAvatarUrl={avatar}
              onAvatarUrlChange={handleAvatarUrlChange}
              serverId={currentServer.id}
            />
          )}
        </div>

        {/* Real Name */}
        <div
          id="setting-profile.realname"
          className={`space-y-2 p-4 rounded-lg transition-all duration-300 ${
            highlightedSetting === "profile.realname"
              ? "bg-yellow-400/20 ring-2 ring-yellow-400"
              : ""
          }`}
        >
          <label className="block text-discord-text-normal text-sm font-medium">
            Real Name
          </label>
          <p className="text-discord-text-muted text-xs">
            Your real or full name (metadata: realname)
          </p>
          <input
            ref={realnameInputRef}
            type="text"
            value={realname}
            onChange={handleRealnameChange}
            placeholder="Enter real name"
            className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
          />
        </div>

        {/* Homepage */}
        <div
          id="setting-profile.homepage"
          className={`space-y-2 p-4 rounded-lg transition-all duration-300 ${
            highlightedSetting === "profile.homepage"
              ? "bg-yellow-400/20 ring-2 ring-yellow-400"
              : ""
          }`}
        >
          <label className="block text-discord-text-normal text-sm font-medium">
            Homepage
          </label>
          <p className="text-discord-text-muted text-xs">
            Your personal website or homepage URL (metadata: homepage)
          </p>
          <input
            type="text"
            value={homepage}
            onChange={handleHomepageChange}
            placeholder="https://example.com"
            className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
          />
        </div>

        {/* Status */}
        <div
          id="setting-profile.status"
          className={`space-y-2 p-4 rounded-lg transition-all duration-300 ${
            highlightedSetting === "profile.status"
              ? "bg-yellow-400/20 ring-2 ring-yellow-400"
              : ""
          }`}
        >
          <label className="block text-discord-text-normal text-sm font-medium">
            Status
          </label>
          <p className="text-discord-text-muted text-xs">
            Your current status message (metadata: status)
          </p>
          <input
            ref={statusInputRef}
            type="text"
            value={status}
            onChange={handleStatusChange}
            placeholder="What's on your mind?"
            className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
          />
        </div>

        {/* Color */}
        <div
          id="setting-profile.color"
          className={`space-y-2 p-4 rounded-lg transition-all duration-300 ${
            highlightedSetting === "profile.color"
              ? "bg-yellow-400/20 ring-2 ring-yellow-400"
              : ""
          }`}
        >
          <label className="block text-discord-text-normal text-sm font-medium">
            Color
          </label>
          <p className="text-discord-text-muted text-xs">
            Your preferred color code (metadata: color)
          </p>
          <div className="flex space-x-2">
            <input
              type="color"
              value={color || "#000000"}
              onChange={handleColorChange}
              className="w-12 h-8 rounded border-none cursor-pointer"
            />
            <input
              ref={colorInputRef}
              type="text"
              value={color}
              onChange={handleColorChange}
              placeholder="#000000"
              className="flex-1 bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
            />
          </div>
        </div>

        {/* Bot */}
        <div
          id="setting-profile.bot"
          className={`space-y-2 p-4 rounded-lg transition-all duration-300 ${
            highlightedSetting === "profile.bot"
              ? "bg-yellow-400/20 ring-2 ring-yellow-400"
              : ""
          }`}
        >
          <label className="block text-discord-text-normal text-sm font-medium">
            Bot
          </label>
          <p className="text-discord-text-muted text-xs">
            Mark as bot (metadata: bot) - usually 'on' or empty
          </p>
          <input
            ref={botInputRef}
            type="text"
            value={bot}
            onChange={handleBotChange}
            placeholder="on"
            className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
          />
        </div>
      </div>
    );
  };

  // Render account settings
  const renderAccountFields = () => {
    if (!isHostedChatMode) {
      return (
        <div className="text-discord-text-muted text-sm italic">
          Account settings are only available in hosted chat mode.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* IRC Operator Authentication */}
        <div className="space-y-4 p-4 bg-discord-dark-400 rounded">
          <h3 className="text-discord-text-normal font-medium">IRC Operator</h3>
          <p className="text-discord-text-muted text-sm">
            Authenticate as an IRC Operator for administrative access
          </p>

          <div className="space-y-2">
            <label className="block text-discord-text-normal text-sm font-medium">
              Oper Name
            </label>
            <input
              type="text"
              value={operName}
              onChange={(e) => setOperName(e.target.value)}
              placeholder="Enter oper username"
              className="w-full bg-discord-dark-500 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-discord-text-normal text-sm font-medium">
              Oper Password
            </label>
            <input
              type="password"
              value={operPassword}
              onChange={(e) => setOperPassword(e.target.value)}
              placeholder="Enter oper password"
              className="w-full bg-discord-dark-500 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="operOnConnect"
              checked={operOnConnect}
              onChange={(e) => setOperOnConnect(e.target.checked)}
              className="accent-discord-primary"
            />
            <label
              htmlFor="operOnConnect"
              className="text-discord-text-normal text-sm"
            >
              Authenticate on connect
            </label>
          </div>

          <button
            type="button"
            onClick={handleOperUp}
            disabled={!operName.trim() || !operPassword.trim()}
            className="w-full rounded bg-discord-button-success-default px-4 py-2 text-white hover:bg-discord-button-success-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Authenticate Now
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      {...getBackdropProps()}
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
    >
      <div
        {...getContentProps()}
        className="bg-discord-dark-200 rounded-lg w-full max-w-4xl h-[80vh] flex overflow-hidden"
      >
        {/* Sidebar */}
        <div className="bg-discord-dark-300 flex flex-col">
          <div className="p-4 border-b border-discord-dark-500 flex justify-center">
            {isMobile ? (
              <FaCog className="text-white text-xl" />
            ) : (
              <h2 className="text-white text-xl font-bold">User Settings</h2>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <nav className="p-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`flex items-center ${isMobile ? "justify-center px-2" : "w-full px-3 text-left"} py-2 mb-1 rounded transition-colors overflow-hidden min-w-0 ${
                    activeCategory === category.id
                      ? "bg-discord-primary text-white"
                      : "text-discord-text-muted hover:text-white hover:bg-discord-dark-400"
                  }`}
                >
                  <div className={`${isMobile ? "text-lg" : "mr-3 text-sm"}`}>
                    {category.icon}
                  </div>
                  <span className={`${isMobile ? "hidden" : ""}`}>
                    {category.title}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center p-4 border-b border-discord-dark-500">
            <h3 className="text-white text-lg font-semibold">
              {categories.find((c) => c.id === activeCategory)?.title}
            </h3>
            <button
              onClick={handleClose}
              className="text-discord-text-muted hover:text-white"
            >
              <FaTimes />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Profile category - custom rendering */}
            {activeCategory === "profile" && renderProfileFields()}

            {/* Account category - custom rendering */}
            {activeCategory === "account" && renderAccountFields()}

            {/* Other categories - use SettingRenderer */}
            {activeCategory !== "profile" && activeCategory !== "account" && (
              <div className="space-y-4">
                {categorySettings.map((setting) => (
                  <SettingField
                    key={setting.id}
                    setting={setting}
                    value={settings[setting.id] ?? setting.defaultValue}
                    onChange={(value) => handleSettingChange(setting.id, value)}
                    isHighlighted={highlightedSetting === setting.id}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end p-4 border-t border-discord-dark-500 space-x-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-discord-dark-400 text-discord-text-normal rounded font-medium hover:bg-discord-dark-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
              className={`px-4 py-2 text-white rounded font-medium transition-colors ${
                hasUnsavedChanges
                  ? "bg-discord-primary hover:bg-opacity-80"
                  : "bg-discord-dark-400 text-discord-text-muted cursor-not-allowed"
              }`}
            >
              {hasUnsavedChanges ? "Save Changes" : "No Changes"}
            </button>
          </div>
        </div>
      </div>
      {/* User Profile Modal */}
      {viewProfileModalOpen && currentServer && currentUser && (
        <UserProfileModal
          isOpen={viewProfileModalOpen}
          onClose={() => setViewProfileModalOpen(false)}
          serverId={currentServer.id}
          username={currentUser.username}
        />
      )}
    </div>
  );
});

UserSettings.displayName = "UserSettings";

export default UserSettings;
