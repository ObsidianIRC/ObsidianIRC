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
import { isValidIgnorePattern } from "../../lib/ignoreUtils";
import ircClient from "../../lib/ircClient";
import useStore, { serverSupportsMetadata } from "../../store";
import AvatarUpload from "./AvatarUpload";
import UserProfileModal from "./UserProfileModal";

type SettingsCategory =
  | "profile"
  | "notifications"
  | "preferences"
  | "media"
  | "account";

// Component for displaying setting fields
const SettingField: React.FC<{
  label: string;
  description: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="space-y-2">
    <div>
      <label className="block text-discord-text-normal text-sm font-medium">
        {label}
      </label>
      <p className="text-discord-text-muted text-xs">{description}</p>
    </div>
    {children}
  </div>
);

// Component for managing custom mentions list
const CustomMentionsList: React.FC<{
  globalCustomMentions: string[];
  updateGlobalSettings: (updates: Record<string, unknown>) => void;
}> = ({ globalCustomMentions, updateGlobalSettings }) => {
  const [newMention, setNewMention] = useState("");

  const handleAddMention = () => {
    if (
      newMention.trim() &&
      !globalCustomMentions.includes(newMention.trim())
    ) {
      updateGlobalSettings({
        customMentions: [...globalCustomMentions, newMention.trim()],
      });
      setNewMention("");
    }
  };

  const handleRemoveMention = (mention: string) => {
    updateGlobalSettings({
      customMentions: globalCustomMentions.filter((m) => m !== mention),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddMention();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex space-x-2">
        <input
          type="text"
          value={newMention}
          onChange={(e) => setNewMention(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Add a word or phrase..."
          className="flex-1 rounded border border-discord-button-secondary-default bg-discord-input-bg px-3 py-2 text-discord-text-normal placeholder-discord-text-muted focus:border-discord-text-link focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAddMention}
          className="rounded bg-discord-button-success-default px-4 py-2 text-white hover:bg-discord-button-success-hover"
        >
          Add
        </button>
      </div>
      {globalCustomMentions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {globalCustomMentions.map((mention) => (
            <span
              key={mention}
              className="inline-flex items-center rounded-full bg-discord-mention-bg px-3 py-1 text-sm text-discord-mention-color"
            >
              {mention}
              <button
                type="button"
                onClick={() => handleRemoveMention(mention)}
                className="ml-2 text-discord-text-muted hover:text-discord-text-normal"
              >
                <FaTimes size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// Component for managing ignore list
const IgnoreList: React.FC<{
  ignoreList: string[];
  addToIgnoreList: (pattern: string) => void;
  removeFromIgnoreList: (pattern: string) => void;
}> = ({ ignoreList, addToIgnoreList, removeFromIgnoreList }) => {
  const [newPattern, setNewPattern] = useState("");
  const [validationError, setValidationError] = useState("");

  const handleAddPattern = () => {
    const trimmed = newPattern.trim();
    if (!trimmed) {
      setValidationError("Pattern cannot be empty");
      return;
    }

    if (!isValidIgnorePattern(trimmed)) {
      setValidationError(
        "Invalid pattern format. Use nick!user@host format (wildcards * allowed)",
      );
      return;
    }

    if (ignoreList.includes(trimmed)) {
      setValidationError("Pattern already exists");
      return;
    }

    addToIgnoreList(trimmed);
    setNewPattern("");
    setValidationError("");
  };

  const handleRemovePattern = (pattern: string) => {
    removeFromIgnoreList(pattern);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddPattern();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPattern(e.target.value);
    setValidationError(""); // Clear error when user types
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newPattern}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="nick!user@host (e.g., spam*!*@*, *!*@badhost.com)"
            className={`flex-1 rounded border px-3 py-2 text-discord-text-normal placeholder-discord-text-muted focus:outline-none ${
              validationError
                ? "border-red-500 bg-red-900/20 focus:border-red-400"
                : "border-discord-button-secondary-default bg-discord-input-bg focus:border-discord-text-link"
            }`}
          />
          <button
            type="button"
            onClick={handleAddPattern}
            className="rounded bg-discord-button-success-default px-4 py-2 text-white hover:bg-discord-button-success-hover"
          >
            Add
          </button>
        </div>
        {validationError && (
          <p className="text-red-400 text-xs">{validationError}</p>
        )}
        <p className="text-discord-text-muted text-xs">
          Use * for wildcards. Examples: baduser!*@*, *!*@spammer.com,
          nick123!user@host.net
        </p>
      </div>
      {ignoreList.length > 0 && (
        <div className="space-y-2">
          <p className="text-discord-text-muted text-sm">
            {ignoreList.length} ignored pattern
            {ignoreList.length !== 1 ? "s" : ""}:
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {ignoreList.map((pattern) => (
              <div
                key={pattern}
                className="flex items-center justify-between bg-discord-dark-400 rounded px-3 py-2"
              >
                <code className="text-discord-text-normal text-sm font-mono">
                  {pattern}
                </code>
                <button
                  type="button"
                  onClick={() => handleRemovePattern(pattern)}
                  className="ml-2 text-discord-text-muted hover:text-red-400 transition-colors"
                  title="Remove pattern"
                >
                  <FaTimes size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {ignoreList.length === 0 && (
        <p className="text-discord-text-muted text-sm italic">
          No users ignored
        </p>
      )}
    </div>
  );
};

const UserSettings: React.FC = React.memo(() => {
  const {
    toggleUserProfileModal,
    setProfileViewRequest,
    servers,
    ui,
    metadataSet,
    sendRaw,
    setName,
    changeNick,
    globalSettings: {
      enableNotificationSounds: globalEnableNotificationSounds,
      notificationSound: globalNotificationSound,
      enableHighlights: globalEnableHighlights,
      sendTypingNotifications: globalSendTypingNotifications,
      nickname: globalNickname,
      accountName: globalAccountName,
      accountPassword: globalAccountPassword,
      customMentions: globalCustomMentions,
      ignoreList: globalIgnoreList,
      showEvents: globalShowEvents,
      showNickChanges: globalShowNickChanges,
      showJoinsParts: globalShowJoinsParts,
      showQuits: globalShowQuits,
      showKicks: globalShowKicks,
      enableMultilineInput: globalEnableMultilineInput,
      multilineOnShiftEnter: globalMultilineOnShiftEnter,
      autoFallbackToSingleLine: globalAutoFallbackToSingleLine,
      showSafeMedia: globalShowSafeMedia,
      showExternalContent: globalShowExternalContent,
      enableMarkdownRendering: globalEnableMarkdownRendering,
    },
    updateGlobalSettings,
    addToIgnoreList,
    removeFromIgnoreList,
  } = useStore();

  // Memoize the current server and metadata support to prevent unnecessary re-renders
  const currentServer = useMemo(
    () => servers.find((s) => s.id === ui.selectedServerId),
    [servers, ui.selectedServerId],
  );

  // Get the current user for the selected server with metadata from store
  const currentUser = useMemo(() => {
    if (!currentServer) return null;

    // Get the current user's username from IRCClient
    const ircCurrentUser = ircClient.getCurrentUser(currentServer.id);
    if (!ircCurrentUser) return null;

    // Find the current user in the server's channel data to get metadata
    for (const channel of currentServer.channels) {
      const userWithMetadata = channel.users.find(
        (u) => u.username === ircCurrentUser.username,
      );
      if (userWithMetadata) {
        return userWithMetadata;
      }
    }

    // If not found in channels, return the basic IRC user
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

  // User Profile Modal state
  const [viewProfileModalOpen, setViewProfileModalOpen] = useState(false);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
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

  // Settings state
  const [enableNotificationSounds, setEnableNotificationSounds] = useState(
    globalEnableNotificationSounds,
  );
  const [notificationSound, setNotificationSound] = useState(
    globalNotificationSound,
  );
  const [notificationSoundFile, setNotificationSoundFile] =
    useState<File | null>(null);
  const [enableHighlights, setEnableHighlights] = useState(
    globalEnableHighlights,
  );
  const [sendTypingNotifications, setSendTypingNotifications] = useState(
    globalSendTypingNotifications,
  );

  // Media settings state
  const [showSafeMedia, setShowSafeMedia] = useState(globalShowSafeMedia);
  const [showExternalContent, setShowExternalContent] = useState(
    globalShowExternalContent,
  );
  const [enableMarkdownRendering, setEnableMarkdownRendering] = useState(
    globalEnableMarkdownRendering,
  );

  // Account state (for hosted chat mode)
  const [nickname, setNickname] = useState(
    globalNickname || currentUser?.username || "",
  );
  const [newNickname, setNewNickname] = useState(currentUser?.username || "");
  const [accountName, setAccountName] = useState(globalAccountName);
  const [accountPassword, setAccountPassword] = useState(globalAccountPassword);

  // Original values for change tracking
  const [originalValues, setOriginalValues] = useState<{
    avatar: string;
    displayName: string;
    realname: string;
    homepage: string;
    status: string;
    color: string;
    bot: string;
    newNickname: string;
    enableNotificationSounds: boolean;
    notificationSound: string;
    enableHighlights: boolean;
    sendTypingNotifications: boolean;
    nickname: string;
    accountName: string;
    accountPassword: string;
    showSafeMedia: boolean;
    showExternalContent: boolean;
    enableMarkdownRendering: boolean;
    showEvents: boolean;
    showNickChanges: boolean;
    showJoinsParts: boolean;
    showQuits: boolean;
    showKicks: boolean;
    enableMultilineInput: boolean;
    multilineOnShiftEnter: boolean;
    autoFallbackToSingleLine: boolean;
  } | null>(null);

  // Track if there are unsaved changes
  const hasUnsavedChanges =
    originalValues &&
    (avatar !== originalValues.avatar ||
      displayName !== originalValues.displayName ||
      realname !== originalValues.realname ||
      homepage !== originalValues.homepage ||
      status !== originalValues.status ||
      color !== originalValues.color ||
      bot !== originalValues.bot ||
      newNickname !== originalValues.newNickname ||
      enableNotificationSounds !== originalValues.enableNotificationSounds ||
      notificationSound !== originalValues.notificationSound ||
      enableHighlights !== originalValues.enableHighlights ||
      sendTypingNotifications !== originalValues.sendTypingNotifications ||
      nickname !== originalValues.nickname ||
      accountName !== originalValues.accountName ||
      accountPassword !== originalValues.accountPassword ||
      showSafeMedia !== originalValues.showSafeMedia ||
      showExternalContent !== originalValues.showExternalContent ||
      enableMarkdownRendering !== originalValues.enableMarkdownRendering ||
      globalShowEvents !== originalValues.showEvents ||
      globalShowNickChanges !== originalValues.showNickChanges ||
      globalShowJoinsParts !== originalValues.showJoinsParts ||
      globalShowQuits !== originalValues.showQuits ||
      globalShowKicks !== originalValues.showKicks ||
      globalEnableMultilineInput !== originalValues.enableMultilineInput ||
      globalMultilineOnShiftEnter !== originalValues.multilineOnShiftEnter ||
      globalAutoFallbackToSingleLine !==
        originalValues.autoFallbackToSingleLine);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for input fields to preserve focus during re-renders
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const botInputRef = useRef<HTMLInputElement>(null);
  const realnameInputRef = useRef<HTMLInputElement>(null);

  // Memoized onChange handlers to prevent unnecessary re-renders
  const handleNewNicknameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewNickname(e.target.value);
      // Schedule focus restoration after React's render cycle
      setTimeout(() => {
        if (document.activeElement !== nicknameInputRef.current) {
          nicknameInputRef.current?.focus();
        }
      }, 0);
    },
    [],
  );

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

  const handleNicknameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNickname(e.target.value);
    },
    [],
  );

  const handleAccountNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAccountName(e.target.value);
    },
    [],
  );

  const handleAccountPasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAccountPassword(e.target.value);
    },
    [],
  );

  // Function to handle closing with unsaved changes warning
  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm(
        "You have unsaved changes. Are you sure you want to close without saving?",
      );
      if (!confirmClose) {
        return;
      }
    }
    // Reset original values when closing so it will reinitialize next time
    setOriginalValues(null);
    toggleUserProfileModal(false);
  };

  // Audio playback utility
  const playNotificationSound = async (soundFile?: File | string | null) => {
    try {
      let audioSrc: string;

      if (soundFile instanceof File) {
        // Play custom uploaded sound from File object
        audioSrc = URL.createObjectURL(soundFile);
      } else if (typeof soundFile === "string") {
        // Play custom sound from URL string (for previously saved sounds)
        audioSrc = soundFile;
      } else {
        // Play default notification sound (we'll use a simple beep)
        // Create a simple beep sound using Web Audio API
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const audioContext = new AudioContextClass();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.type = "sine";

        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(
          0.1,
          audioContext.currentTime + 0.01,
        );
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.5,
        );

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        return;
      }

      const audio = new Audio(audioSrc);
      audio.volume = 0.5; // Set reasonable volume
      await audio.play();

      // Clean up object URL if it was created from a File
      if (soundFile instanceof File) {
        setTimeout(() => URL.revokeObjectURL(audioSrc), 1000);
      }
    } catch (error) {
      console.error("Failed to play notification sound:", error);
      // Fallback to default browser notification sound
      if (soundFile) {
        // If custom sound fails, try default sound
        playNotificationSound();
      }
    }
  };

  // Load existing metadata on mount - only once when modal opens
  useEffect(() => {
    if (currentUser && !originalValues) {
      const avatarValue = currentUser.metadata?.avatar?.value || "";
      const displayNameValue =
        currentUser.metadata?.["display-name"]?.value || "";
      const realnameValue = currentUser.displayName || "";
      const homepageValue = currentUser.metadata?.homepage?.value || "";
      const statusValue = currentUser.metadata?.status?.value || "";
      const colorValue = currentUser.metadata?.color?.value || "";
      const botValue = currentUser.metadata?.bot?.value || "";
      const nicknameValue = currentUser.username || "";

      // Set current form values
      setAvatar(avatarValue);
      setDisplayName(displayNameValue);
      setRealname(realnameValue);
      setHomepage(homepageValue);
      setStatus(statusValue);
      setColor(colorValue);
      setBot(botValue);
      setNewNickname(nicknameValue);

      // Set global settings values
      setEnableNotificationSounds(globalEnableNotificationSounds);
      // Migrate old default (empty string) to notif1
      const migratedNotificationSound =
        globalNotificationSound === ""
          ? "/sounds/notif1.mp3"
          : globalNotificationSound;
      setNotificationSound(migratedNotificationSound);

      // Save migrated setting back to store if it was changed
      if (globalNotificationSound === "") {
        updateGlobalSettings({ notificationSound: "/sounds/notif1.mp3" });
      }

      setEnableHighlights(globalEnableHighlights);
      setSendTypingNotifications(globalSendTypingNotifications);
      setNickname(globalNickname || currentUser?.username || "");
      setAccountName(globalAccountName);
      setAccountPassword(globalAccountPassword);

      // Set original values for change tracking - only once
      setOriginalValues({
        avatar: avatarValue,
        displayName: displayNameValue,
        realname: realnameValue,
        homepage: homepageValue,
        status: statusValue,
        color: colorValue,
        bot: botValue,
        newNickname: nicknameValue,
        enableNotificationSounds: globalEnableNotificationSounds,
        notificationSound: migratedNotificationSound,
        enableHighlights: globalEnableHighlights,
        sendTypingNotifications: globalSendTypingNotifications,
        nickname: globalNickname || currentUser?.username || "",
        accountName: globalAccountName,
        accountPassword: globalAccountPassword,
        showSafeMedia: globalShowSafeMedia,
        showExternalContent: globalShowExternalContent,
        enableMarkdownRendering: globalEnableMarkdownRendering,
        showEvents: globalShowEvents,
        showNickChanges: globalShowNickChanges,
        showJoinsParts: globalShowJoinsParts,
        showQuits: globalShowQuits,
        showKicks: globalShowKicks,
        enableMultilineInput: globalEnableMultilineInput,
        multilineOnShiftEnter: globalMultilineOnShiftEnter,
        autoFallbackToSingleLine: globalAutoFallbackToSingleLine,
      });
    }
  }, [
    currentUser?.id,
    currentUser?.displayName,
    currentUser?.metadata?.["display-name"]?.value,
    currentUser?.metadata?.avatar?.value,
    currentUser?.metadata?.bot?.value,
    currentUser?.metadata?.color?.value,
    currentUser?.metadata?.homepage?.value,
    currentUser?.metadata?.status?.value,
    currentUser?.username,
    globalAccountName,
    globalAccountPassword,
    globalEnableHighlights,
    globalEnableNotificationSounds,
    globalNickname,
    globalNotificationSound,
    globalSendTypingNotifications,
    globalShowSafeMedia,
    globalShowExternalContent,
    currentUser,
    originalValues,
    updateGlobalSettings,
    globalAutoFallbackToSingleLine,
    globalEnableMarkdownRendering,
    globalEnableMultilineInput,
    globalMultilineOnShiftEnter,
    globalShowEvents,
    globalShowJoinsParts,
    globalShowKicks,
    globalShowNickChanges,
    globalShowQuits,
  ]); // Only depend on user ID - removed all other dependencies

  const handleSaveMetadata = (key: string, value: string) => {
    if (currentServer && currentUser) {
      metadataSet(
        currentServer.id,
        currentUser.username,
        key,
        value || undefined,
      );
    }
  };

  const handleSoundFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleSoundFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setNotificationSound(url);
      setNotificationSoundFile(file);
    }
  };

  const handleNickChange = () => {
    if (
      currentServer &&
      newNickname.trim() &&
      newNickname.trim() !== currentUser?.username
    ) {
      changeNick(currentServer.id, newNickname.trim());
    }
  };

  const handleSaveAll = () => {
    if (!originalValues) {
      return; // Don't save if original values aren't set yet
    }

    if (currentServer && currentUser) {
      // Handle profile metadata (only when metadata is supported and values have changed)
      if (supportsMetadata) {
        // Only update display name if it changed
        if (displayName !== originalValues.displayName) {
          try {
            metadataSet(
              currentServer.id,
              "*", // Use * to refer to current user (self)
              "display-name",
              displayName || undefined,
            );
          } catch (error) {
            console.error("Failed to set display name metadata:", error);
          }
        }

        const metadataUpdates = [
          { key: "avatar", value: avatar, original: originalValues.avatar },
          {
            key: "homepage",
            value: homepage,
            original: originalValues.homepage,
          },
          { key: "status", value: status, original: originalValues.status },
          { key: "color", value: color, original: originalValues.color },
          { key: "bot", value: bot, original: originalValues.bot },
        ];

        metadataUpdates.forEach(({ key, value, original }) => {
          // Only update if the value has changed
          if (value !== original) {
            try {
              metadataSet(
                currentServer.id,
                "*", // Use * to refer to current user (self)
                key,
                value || undefined,
              );
            } catch (error) {
              console.error(`Failed to set ${key} metadata:`, error);
            }
          } else {
          }
        });
      }

      // Handle realname only if it changed
      if (realname !== originalValues.realname) {
        try {
          setName(currentServer.id, realname);
        } catch (error) {
          console.error("Failed to set realname:", error);
        }
      }
    }

    // Save global settings only if they changed
    const globalSettingsUpdates: Record<string, unknown> = {};

    if (enableNotificationSounds !== originalValues.enableNotificationSounds) {
      globalSettingsUpdates.enableNotificationSounds = enableNotificationSounds;
    }
    if (notificationSound !== originalValues.notificationSound) {
      globalSettingsUpdates.notificationSound = notificationSound;
    }
    if (enableHighlights !== originalValues.enableHighlights) {
      globalSettingsUpdates.enableHighlights = enableHighlights;
    }
    if (sendTypingNotifications !== originalValues.sendTypingNotifications) {
      globalSettingsUpdates.sendTypingNotifications = sendTypingNotifications;
    }
    if (showSafeMedia !== originalValues.showSafeMedia) {
      globalSettingsUpdates.showSafeMedia = showSafeMedia;
    }
    if (showExternalContent !== originalValues.showExternalContent) {
      globalSettingsUpdates.showExternalContent = showExternalContent;
    }
    if (enableMarkdownRendering !== originalValues.enableMarkdownRendering) {
      globalSettingsUpdates.enableMarkdownRendering = enableMarkdownRendering;
    }
    if (globalShowEvents !== originalValues.showEvents) {
      globalSettingsUpdates.showEvents = globalShowEvents;
    }
    if (globalShowNickChanges !== originalValues.showNickChanges) {
      globalSettingsUpdates.showNickChanges = globalShowNickChanges;
    }
    if (globalShowJoinsParts !== originalValues.showJoinsParts) {
      globalSettingsUpdates.showJoinsParts = globalShowJoinsParts;
    }
    if (globalShowQuits !== originalValues.showQuits) {
      globalSettingsUpdates.showQuits = globalShowQuits;
    }
    if (globalShowKicks !== originalValues.showKicks) {
      globalSettingsUpdates.showKicks = globalShowKicks;
    }
    if (globalEnableMultilineInput !== originalValues.enableMultilineInput) {
      globalSettingsUpdates.enableMultilineInput = globalEnableMultilineInput;
    }
    if (globalMultilineOnShiftEnter !== originalValues.multilineOnShiftEnter) {
      globalSettingsUpdates.multilineOnShiftEnter = globalMultilineOnShiftEnter;
    }
    if (
      globalAutoFallbackToSingleLine !== originalValues.autoFallbackToSingleLine
    ) {
      globalSettingsUpdates.autoFallbackToSingleLine =
        globalAutoFallbackToSingleLine;
    }

    if (isHostedChatMode) {
      if (nickname !== originalValues.nickname) {
        globalSettingsUpdates.nickname = nickname;
      }
      if (accountName !== originalValues.accountName) {
        globalSettingsUpdates.accountName = accountName;
      }
      if (accountPassword !== originalValues.accountPassword) {
        globalSettingsUpdates.accountPassword = accountPassword;
      }
    }

    // Only update global settings if there are changes
    if (Object.keys(globalSettingsUpdates).length > 0) {
      updateGlobalSettings(globalSettingsUpdates);
    }

    // Reset original values when closing after save
    setOriginalValues(null);
    toggleUserProfileModal(false);
  };

  const categories = [
    { id: "profile" as const, name: "Profile", icon: FaUser },
    { id: "notifications" as const, name: "Notifications", icon: FaBell },
    { id: "preferences" as const, name: "Preferences", icon: FaCog },
    { id: "media" as const, name: "Media", icon: FaImage },
    ...(isHostedChatMode
      ? [{ id: "account" as const, name: "Account", icon: FaServer }]
      : []),
  ];

  const renderProfileSettings = () => (
    <div
      key={`profile-${currentUser?.id}-${originalValues ? "loaded" : "loading"}`}
      className="space-y-6"
    >
      {/* View Profile Button */}
      {currentUser && currentServer && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => {
              if (hasUnsavedChanges) {
                setShowUnsavedChangesModal(true);
              } else {
                // Close User Settings and request to open User Profile
                setProfileViewRequest(currentServer.id, currentUser.username);
                toggleUserProfileModal(false);
              }
            }}
            className="px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-[#5865F2]/20 flex items-center gap-2"
          >
            <FaUser size={14} />
            View Profile
          </button>
        </div>
      )}

      <SettingField
        label="Username"
        description="Your unique identifier on this server"
      >
        <div className="flex items-center space-x-2">
          <input
            key="newNickname-input"
            ref={nicknameInputRef}
            type="text"
            value={newNickname}
            onChange={handleNewNicknameChange}
            placeholder="Enter new nickname"
            className="flex-1 bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
          />
          {newNickname.trim() &&
            newNickname.trim() !== currentUser?.username && (
              <button
                onClick={handleNickChange}
                className="px-3 py-2 bg-discord-primary hover:bg-discord-primary-hover text-white rounded transition-colors"
              >
                Change Nick
              </button>
            )}
        </div>
      </SettingField>

      {supportsMetadata && (
        <>
          <SettingField
            label="Display Name"
            description="An alternative name that others will see instead of your username"
          >
            <input
              key="displayName-input"
              ref={displayNameInputRef}
              type="text"
              value={displayName}
              onChange={handleDisplayNameChange}
              placeholder="Alternative display name"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
            />
          </SettingField>

          <SettingField
            label="Avatar"
            description="Your profile picture (upload an image or provide a URL)"
          >
            {currentServer?.filehost ? (
              <AvatarUpload
                currentAvatarUrl={avatar}
                onAvatarUrlChange={handleAvatarUrlChange}
                serverId={currentServer.id}
              />
            ) : (
              <input
                key="avatar-input"
                ref={avatarInputRef}
                type="url"
                value={avatar}
                onChange={handleAvatarChange}
                placeholder="https://example.com/avatar.jpg"
                className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
              />
            )}
          </SettingField>

          <SettingField
            label="Homepage URL"
            description="Your personal website or social media profile"
          >
            <input
              type="url"
              value={homepage}
              onChange={handleHomepageChange}
              placeholder="https://example.com"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
            />
          </SettingField>

          <SettingField
            label="Status Message"
            description="A short message describing what you're currently doing"
          >
            <input
              key="status-input"
              ref={statusInputRef}
              type="text"
              value={status}
              onChange={handleStatusChange}
              placeholder="Working from home"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
            />
          </SettingField>

          <SettingField
            label="Username Color"
            description="The color your username appears in chat messages"
          >
            <div className="flex items-center space-x-2">
              <input
                key="color-picker"
                type="color"
                value={color}
                onChange={handleColorChange}
                className="w-12 h-8 rounded border-none cursor-pointer"
              />
              <input
                key="color-text"
                ref={colorInputRef}
                type="text"
                value={color}
                onChange={handleColorChange}
                placeholder="e.g., #800040"
                className="flex-1 bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
              />
            </div>
          </SettingField>

          <SettingField
            label="Bot Software"
            description="If you're a bot, specify the software you're running (leave blank for humans)"
          >
            <input
              ref={botInputRef}
              type="text"
              value={bot}
              onChange={handleBotChange}
              placeholder="Bot software name"
              className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
            />
          </SettingField>
        </>
      )}

      <SettingField
        label="GECOS"
        description="Your GECOS field, visible in WHOIS responses (display name, not necessarily your real name)"
      >
        <input
          ref={realnameInputRef}
          type="text"
          value={realname}
          onChange={handleRealnameChange}
          placeholder="Display name for GECOS field"
          className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
        />
      </SettingField>

      {!supportsMetadata && (
        <div className="bg-discord-dark-400 rounded px-3 py-2 text-discord-text-muted text-sm">
          <p className="font-medium mb-1">Limited Profile Support</p>
          <p>
            This server does not support user metadata. Advanced profile options
            (display name, avatar, status, etc.) will appear when connecting to
            a server with IRC metadata support.
          </p>
        </div>
      )}
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <SettingField
        label="Enable Notification Sounds"
        description="Play a sound when you receive messages or mentions"
      >
        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={enableNotificationSounds}
              onChange={(e) => setEnableNotificationSounds(e.target.checked)}
              className="mr-3 accent-discord-primary"
            />
            <span className="text-discord-text-normal">
              Play notification sounds
            </span>
          </label>
        </div>
      </SettingField>

      {enableNotificationSounds && (
        <SettingField
          label="Notification Sound"
          description="Choose a sound to play for notifications"
        >
          <div className="space-y-3">
            <select
              value={
                notificationSound === "/sounds/notif1.mp3"
                  ? "notif1"
                  : notificationSound === "/sounds/notif2.mp3"
                    ? "notif2"
                    : notificationSound.startsWith("blob:") ||
                        notificationSound.startsWith("data:")
                      ? "custom"
                      : "notif1"
              }
              onChange={(e) => {
                const value = e.target.value;
                if (value === "notif1") {
                  setNotificationSound("/sounds/notif1.mp3");
                  setNotificationSoundFile(null);
                } else if (value === "notif2") {
                  setNotificationSound("/sounds/notif2.mp3");
                  setNotificationSoundFile(null);
                } else if (value === "custom") {
                  handleSoundFileSelect();
                }
              }}
              className="w-full px-3 py-2 bg-discord-input-bg border border-discord-button-secondary-default rounded text-discord-text-normal focus:border-discord-text-link focus:outline-none"
            >
              <option value="notif1">Notif 1</option>
              <option value="notif2">Notif 2</option>
              <option value="custom">Custom Upload</option>
            </select>

            {(notificationSound.startsWith("blob:") ||
              notificationSound.startsWith("data:")) && (
              <div className="flex items-center space-x-2">
                <span className="text-discord-text-muted text-sm">
                  Custom sound selected
                </span>
                <button
                  onClick={() =>
                    playNotificationSound(
                      notificationSoundFile || notificationSound,
                    )
                  }
                  className="px-3 py-1 bg-discord-primary hover:bg-discord-primary-hover text-white rounded text-sm transition-colors"
                >
                  Test Sound
                </button>
              </div>
            )}

            {notificationSound === "/sounds/notif1.mp3" && (
              <div className="flex items-center space-x-2">
                <span className="text-discord-text-muted text-sm">
                  Notif 1 sound selected
                </span>
                <button
                  onClick={() => playNotificationSound("/sounds/notif1.mp3")}
                  className="px-3 py-1 bg-discord-primary hover:bg-discord-primary-hover text-white rounded text-sm transition-colors"
                >
                  Test Sound
                </button>
              </div>
            )}

            {notificationSound === "/sounds/notif2.mp3" && (
              <div className="flex items-center space-x-2">
                <span className="text-discord-text-muted text-sm">
                  Notif 2 sound selected
                </span>
                <button
                  onClick={() => playNotificationSound("/sounds/notif2.mp3")}
                  className="px-3 py-1 bg-discord-primary hover:bg-discord-primary-hover text-white rounded text-sm transition-colors"
                >
                  Test Sound
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleSoundFileChange}
            className="hidden"
          />
        </SettingField>
      )}

      <SettingField
        label="Enable Highlights"
        description="Get notified when your username is mentioned in messages"
      >
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={enableHighlights}
            onChange={(e) => setEnableHighlights(e.target.checked)}
            className="mr-3 accent-discord-primary"
          />
          <span className="text-discord-text-normal">Highlight mentions</span>
        </label>
      </SettingField>

      {enableHighlights && (
        <SettingField
          label="Custom Mentions"
          description="Additional words or phrases that will trigger highlights"
        >
          <CustomMentionsList
            globalCustomMentions={globalCustomMentions}
            updateGlobalSettings={updateGlobalSettings}
          />
        </SettingField>
      )}
    </div>
  );

  const renderPreferencesSettings = () => (
    <div className="space-y-6">
      <SettingField
        label="Chat Events"
        description="Control which IRC events are displayed in chat channels"
      >
        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={globalShowEvents}
              onChange={(e) =>
                updateGlobalSettings({ showEvents: e.target.checked })
              }
              className="mr-3 accent-discord-primary"
            />
            <span className="text-discord-text-normal">Show chat events</span>
          </label>

          {globalShowEvents && (
            <div className="ml-6 space-y-3 bg-discord-dark-400 p-4 rounded">
              <div className="grid grid-cols-1 gap-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={globalShowNickChanges}
                    onChange={(e) =>
                      updateGlobalSettings({
                        showNickChanges: e.target.checked,
                      })
                    }
                    className="mr-3 accent-discord-primary"
                  />
                  <span className="text-discord-text-muted">
                    Nickname changes
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={globalShowJoinsParts}
                    onChange={(e) =>
                      updateGlobalSettings({ showJoinsParts: e.target.checked })
                    }
                    className="mr-3 accent-discord-primary"
                  />
                  <span className="text-discord-text-muted">Joins & parts</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={globalShowQuits}
                    onChange={(e) =>
                      updateGlobalSettings({ showQuits: e.target.checked })
                    }
                    className="mr-3 accent-discord-primary"
                  />
                  <span className="text-discord-text-muted">Quits</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={globalShowKicks}
                    onChange={(e) =>
                      updateGlobalSettings({ showKicks: e.target.checked })
                    }
                    className="mr-3 accent-discord-primary"
                  />
                  <span className="text-discord-text-muted">Kicks</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </SettingField>

      <SettingField
        label="Send Typing Notifications"
        description="Let others see when you're typing a message"
      >
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={sendTypingNotifications}
            onChange={(e) => setSendTypingNotifications(e.target.checked)}
            className="mr-3 accent-discord-primary"
          />
          <span className="text-discord-text-normal">
            Send typing indicators
          </span>
        </label>
      </SettingField>

      <SettingField
        label="Multiline Messages"
        description="Configure how multiline messages are handled"
      >
        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={globalEnableMultilineInput}
              onChange={(e) =>
                updateGlobalSettings({ enableMultilineInput: e.target.checked })
              }
              className="mr-3 accent-discord-primary"
            />
            <span className="text-discord-text-normal">
              Enable multiline input (Shift+Enter for new line)
            </span>
          </label>

          {globalEnableMultilineInput && (
            <div className="ml-6 space-y-3 bg-discord-dark-400 p-4 rounded">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={globalMultilineOnShiftEnter}
                  onChange={(e) =>
                    updateGlobalSettings({
                      multilineOnShiftEnter: e.target.checked,
                    })
                  }
                  className="mr-3 accent-discord-primary"
                />
                <span className="text-discord-text-muted">
                  Require Shift+Enter for new lines (uncheck to always allow
                  Enter for new lines)
                </span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={globalAutoFallbackToSingleLine}
                  onChange={(e) =>
                    updateGlobalSettings({
                      autoFallbackToSingleLine: e.target.checked,
                    })
                  }
                  className="mr-3 accent-discord-primary"
                />
                <span className="text-discord-text-muted">
                  Auto-concatenate multiline messages when server doesn't
                  support multiline
                </span>
              </label>
            </div>
          )}
        </div>
      </SettingField>

      <SettingField
        label="Ignore List"
        description="Users matching these patterns will have their messages hidden"
      >
        <IgnoreList
          ignoreList={globalIgnoreList}
          addToIgnoreList={addToIgnoreList}
          removeFromIgnoreList={removeFromIgnoreList}
        />
      </SettingField>

      <SettingField
        label="Status"
        description="Your current availability status visible to other users"
      >
        <select
          className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none"
          defaultValue={currentUser?.status || "online"}
        >
          <option value="online">Online</option>
          <option value="idle">Idle</option>
          <option value="dnd">Do Not Disturb</option>
          <option value="invisible">Invisible</option>
        </select>
      </SettingField>
    </div>
  );

  const renderAccountSettings = () => (
    <div className="space-y-6">
      <SettingField
        label="Nickname"
        description="Your preferred nickname for this chat server"
      >
        <input
          type="text"
          value={nickname}
          onChange={handleNicknameChange}
          placeholder="Enter nickname"
          className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
        />
      </SettingField>

      <SettingField
        label="Account Name"
        description="Your account username for SASL authentication (if required)"
      >
        <input
          type="text"
          value={accountName}
          onChange={handleAccountNameChange}
          placeholder="Account username"
          className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
        />
      </SettingField>

      <SettingField
        label="Account Password"
        description="Your account password for SASL authentication (stored locally)"
      >
        <input
          type="password"
          value={accountPassword}
          onChange={handleAccountPasswordChange}
          placeholder="Account password"
          className="w-full bg-discord-dark-400 text-discord-text-normal rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-discord-primary"
        />
      </SettingField>
    </div>
  );

  const renderMediaSettings = () => (
    <div className="space-y-6">
      <SettingField
        label="Show Safe Media"
        description="Automatically display images and media from trusted sources"
      >
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={showSafeMedia}
            onChange={(e) => setShowSafeMedia(e.target.checked)}
            className="mr-3 accent-discord-primary"
          />
          <span className="text-discord-text-normal">
            Enable safe media display
          </span>
        </label>
      </SettingField>

      <SettingField
        label="Show External Content"
        description="Display media from external links (may reveal your IP address to external servers)"
      >
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showExternalContent}
              onChange={(e) => {
                if (!e.target.checked) {
                  setShowExternalContent(false);
                } else {
                  // Show warning modal before enabling
                  setShowExternalContentWarning(true);
                }
              }}
              className="mr-3 accent-discord-primary"
            />
            <span className="text-discord-text-normal">
              Enable external content display
            </span>
          </label>
          <p className="text-discord-text-muted text-sm ml-6">
            ⚠️ Warning: Enabling this will load content from external servers and
            may reveal your IP address.
          </p>
        </div>
      </SettingField>

      <SettingField
        label="Enable Markdown Rendering"
        description="Render markdown syntax in messages (headings, bold, italic, code blocks, etc.)"
      >
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={enableMarkdownRendering}
            onChange={(e) => setEnableMarkdownRendering(e.target.checked)}
            className="mr-3 accent-discord-primary"
          />
          <span className="text-discord-text-normal">
            Enable markdown rendering in messages
          </span>
        </label>
      </SettingField>
    </div>
  );

  const renderActiveCategory = () => {
    switch (activeCategory) {
      case "profile":
        return renderProfileSettings();
      case "notifications":
        return renderNotificationSettings();
      case "preferences":
        return renderPreferencesSettings();
      case "media":
        return renderMediaSettings();
      case "account":
        return renderAccountSettings();
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-discord-dark-200 rounded-lg w-full max-w-4xl h-[80vh] flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-discord-dark-300 flex flex-col">
          <div className="p-4 border-b border-discord-dark-500 flex justify-center">
            {isMobile ? (
              <FaCog className="text-white text-xl" />
            ) : (
              <h2 className="text-white text-xl font-bold">User Settings</h2>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <nav className="p-2">
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`w-full flex items-center ${isMobile ? "justify-center px-2" : "px-3"} py-2 mb-1 rounded text-left transition-colors ${
                      activeCategory === category.id
                        ? "bg-discord-primary text-white"
                        : "text-discord-text-muted hover:text-white hover:bg-discord-dark-400"
                    }`}
                  >
                    <Icon
                      className={`${isMobile ? "text-lg" : "mr-3 text-sm"}`}
                    />
                    {!isMobile && category.name}
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
              {categories.find((c) => c.id === activeCategory)?.name}
            </h3>
            <button
              onClick={handleClose}
              className="text-discord-text-muted hover:text-white"
            >
              <FaTimes />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {renderActiveCategory()}
          </div>

          <div className="flex justify-end p-4 border-t border-discord-dark-500 space-x-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-discord-dark-400 text-discord-text-normal rounded font-medium hover:bg-discord-dark-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
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
      {viewProfileModalOpen && currentUser && currentServer && (
        <UserProfileModal
          isOpen={viewProfileModalOpen}
          onClose={() => setViewProfileModalOpen(false)}
          serverId={currentServer.id}
          username={currentUser.username}
        />
      )}

      {/* Unsaved Changes Warning Modal */}
      {showUnsavedChangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-discord-dark-300 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-white text-xl font-semibold mb-4">
                Unsaved Changes
              </h3>
              <p className="text-discord-text-normal mb-6">
                You have unsaved changes. Would you like to save them before
                viewing your profile?
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowUnsavedChangesModal(false);
                  }}
                  className="px-4 py-2 bg-discord-dark-400 text-discord-text-normal rounded font-medium hover:bg-discord-dark-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (currentUser && currentServer) {
                      setShowUnsavedChangesModal(false);
                      // Close User Settings and request to open User Profile
                      setProfileViewRequest(
                        currentServer.id,
                        currentUser.username,
                      );
                      toggleUserProfileModal(false);
                    }
                  }}
                  className="px-4 py-2 bg-black text-white rounded font-medium hover:bg-gray-900 transition-colors"
                >
                  No
                </button>
                <button
                  onClick={() => {
                    if (currentUser && currentServer) {
                      handleSaveAll();
                      setShowUnsavedChangesModal(false);
                      // Close User Settings and request to open User Profile
                      setProfileViewRequest(
                        currentServer.id,
                        currentUser.username,
                      );
                      toggleUserProfileModal(false);
                    }
                  }}
                  className="px-4 py-2 bg-[#5865F2] text-white rounded font-medium hover:bg-[#4752C4] transition-colors"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* External Content Warning Modal */}
      {showExternalContentWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-discord-dark-300 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-white text-xl font-semibold mb-4">
                ⚠️ External Content Warning
              </h3>
              <p className="text-discord-text-normal mb-4">
                Enabling external content display will load images and media
                from external servers. This may reveal your IP address to those
                servers.
              </p>
              <p className="text-discord-text-muted text-sm mb-6">
                Only enable this if you understand the privacy implications and
                trust the content sources.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowExternalContentWarning(false);
                  }}
                  className="px-4 py-2 bg-discord-dark-400 text-discord-text-normal rounded font-medium hover:bg-discord-dark-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowExternalContentWarning(false);
                    setShowExternalContent(true);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 transition-colors"
                >
                  Enable Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default UserSettings;
