import exifr from "exifr";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import ircClient from "../../lib/ircClient";
import {
  isUrlFromFilehost,
  isUserVerified,
  processMarkdownInText,
} from "../../lib/ircUtils";
import { stripIrcFormatting } from "../../lib/messageFormatter";
import useStore, { loadSavedMetadata } from "../../store";
import type { MessageType, PrivateChat, User } from "../../types";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";
import type { CollapsibleMessageHandle } from "./CollapsibleMessage";
import { InviteMessage } from "./InviteMessage";
import {
  ActionMessage,
  CollapsibleMessage,
  DateSeparator,
  EventMessage,
  JsonLogMessage,
  LinkPreview,
  MessageAvatar,
  MessageHeader,
  MessageReply,
  ReactionsWithActions,
  StandardReplyNotification,
  SystemMessage,
  WhisperMessage,
} from "./index";
import { SwipeableMessage } from "./SwipeableMessage";

// Function to extract JPEG COM (comment) marker data
function extractJpegComment(uint8Array: Uint8Array): string | null {
  // JPEG files start with 0xFF 0xD8 (SOI marker)
  if (
    uint8Array.length < 4 ||
    uint8Array[0] !== 0xff ||
    uint8Array[1] !== 0xd8
  ) {
    return null;
  }

  let offset = 2;

  while (offset < uint8Array.length - 1) {
    // Look for marker (starts with 0xFF)
    if (uint8Array[offset] !== 0xff) {
      break;
    }

    const marker = uint8Array[offset + 1];
    const markerLength = (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];

    // COM marker is 0xFE
    if (marker === 0xfe) {
      // Extract comment data (skip the 2-byte length field)
      const commentData = uint8Array.slice(
        offset + 4,
        offset + markerLength + 2,
      );
      // Convert to string, assuming UTF-8
      try {
        return new TextDecoder("utf-8").decode(commentData);
      } catch (e) {
        // Try latin1 if UTF-8 fails
        return String.fromCharCode.apply(null, Array.from(commentData));
      }
    }

    // Move to next marker
    offset += markerLength + 2;

    // SOS marker (0xDA) indicates start of scan data - comments usually come before this
    if (marker === 0xda) {
      break;
    }
  }

  return null;
}

// Component to display banner overlay for filehost images
const FilehostImageBanner: React.FC<{
  exifData: { author?: string; jwt_expiry?: string; server_expiry?: string };
  serverId?: string;
  onOpenProfile?: (username: string) => void;
}> = ({ exifData, serverId, onOpenProfile }) => {
  const currentUser = serverId ? ircClient.getCurrentUser(serverId) : null;

  if (!exifData.author) return null;

  const [ircNick, ircAccount] = exifData.author.split(":");
  const isVerified =
    currentUser?.account &&
    ircAccount !== "0" &&
    currentUser.account.toLowerCase() === ircAccount.toLowerCase();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the image click
    if (onOpenProfile) {
      onOpenProfile(ircNick);
    }
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded-b-lg flex items-center cursor-pointer hover:bg-opacity-90 transition-opacity"
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        <span>{ircNick}</span>
        {isVerified && (
          <svg
            className="w-3 h-3 text-green-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

// Component to render image with fallback to URL if loading fails
const ImageWithFallback: React.FC<{
  url: string;
  msgid?: string;
  isFilehostImage?: boolean;
  serverId?: string;
  channelId?: string;
  onOpenProfile?: (username: string) => void;
}> = ({
  url,
  msgid,
  isFilehostImage = false,
  serverId,
  channelId,
  onOpenProfile,
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const openMedia = useStore((state) => state.openMedia);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [exifData, setExifData] = useState<{
    author?: string;
    jwt_expiry?: string;
    server_expiry?: string;
  } | null>(null);
  const [exifError, setExifError] = useState(false);

  // Simple in-memory cache for images per session
  const imageCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const resolveTenorUrl = async (sharingUrl: string) => {
      try {
        // Extract ID from Tenor sharing URL: https://tenor.com/view/slug-gif-ID
        const match = sharingUrl.match(/tenor\.com\/view\/.*-gif-(\d+)/);
        if (!match) return sharingUrl;

        const gifId = match[1];
        const apiKey = import.meta.env.VITE_TENOR_API_KEY;

        if (!apiKey) return sharingUrl; // Fallback to original URL if no API key

        // Use Tenor API to get the GIF data
        const response = await fetch(
          `https://tenor.googleapis.com/v2/posts?ids=${gifId}&key=${apiKey}`,
        );

        if (!response.ok) return sharingUrl;

        const data = await response.json();
        if (data.results?.[0]?.media_formats) {
          // Prefer gif format, fallback to other formats
          const media = data.results[0].media_formats;
          return (
            media.gif?.url ||
            media.mediumgif?.url ||
            media.tinygif?.url ||
            sharingUrl
          );
        }
      } catch (error) {
        console.warn("Failed to resolve Tenor URL:", error);
      }
      return sharingUrl;
    };

    const processUrl = async () => {
      let finalUrl = url;

      // Check if this is a Tenor sharing URL that needs resolution
      if (url.match(/tenor\.com\/view\//)) {
        finalUrl = await resolveTenorUrl(url);
        setResolvedUrl(finalUrl);
      } else {
        setResolvedUrl(url);
      }

      // For filehost images, fetch EXIF data
      if (isFilehostImage) {
        try {
          // Fetch the image as a blob to read EXIF data
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const blob = await response.blob();

          const exif = await exifr.parse(blob);

          // Try to find the Comment field in various places
          let commentData = null;
          if (exif?.Comment) {
            commentData = exif.Comment;
          } else if (exif?.UserComment) {
            commentData = exif.UserComment;
          } else if (exif?.ImageDescription) {
            commentData = exif.ImageDescription;
          } else if (exif?.iptc?.Caption) {
            commentData = exif.iptc.Caption;
          } else if (exif?.xmp?.description) {
            commentData = exif.xmp.description;
          }

          // If no comment found in standard EXIF, try to manually parse JPEG COM markers
          if (!commentData) {
            try {
              const arrayBuffer = await blob.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              commentData = extractJpegComment(uint8Array);
            } catch (error) {
              console.warn("Failed to manually parse JPEG comment:", error);
            }
          }

          if (commentData) {
            try {
              const parsedData = JSON.parse(commentData);
              setExifData({
                author: parsedData.author,
                jwt_expiry: parsedData.jwt_expiry,
                server_expiry: parsedData.server_expiry,
              });
            } catch (parseError) {
              console.warn(
                "Failed to parse EXIF Comment JSON:",
                parseError,
                "Raw data:",
                commentData,
              );
              setExifError(true);
            }
          } else {
            console.warn(
              "No Comment field found in EXIF data. Available fields:",
              Object.keys(exif || {}),
            );
            // Log the full exif object for debugging
            console.warn("Full EXIF data:", exif);
            setExifError(true);
          }
        } catch (error) {
          console.warn("Failed to fetch EXIF data:", error);
          setExifError(true);
        }
      }

      // Cache the image in background for future use
      if (!imageCache.current.has(finalUrl)) {
        fetch(finalUrl)
          .then((response) => response.blob())
          .then((blob) => {
            const objectUrl = URL.createObjectURL(blob);
            imageCache.current.set(finalUrl, objectUrl);
          })
          .catch(() => {
            // Ignore cache errors
          });
      }
    };

    processUrl();
  }, [url, isFilehostImage]);

  const displayUrl = resolvedUrl || url;

  if (imageError) {
    // Fallback to showing expired badge
    return (
      <div className="max-w-md">
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-red-100 text-red-800 border border-red-200">
            <span>This image has expired</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <div className="relative inline-block rounded border border-discord-dark-500/50 overflow-hidden">
        {!imageLoaded && !imageError && (
          <div
            className="flex items-center justify-center bg-discord-dark-400/50"
            style={{ width: "200px", height: "150px" }}
          >
            <FaSpinner className="text-discord-text-muted animate-spin text-lg" />
          </div>
        )}
        <img
          src={displayUrl}
          alt={isFilehostImage ? "Filehost image" : "GIF"}
          className={`max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity ${
            imageLoaded ? "block" : "hidden"
          }`}
          onClick={() => openMedia(displayUrl, msgid, serverId, channelId)}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          style={{ maxHeight: "150px" }}
        />
        {isFilehostImage && exifData && imageLoaded && (
          <FilehostImageBanner
            exifData={exifData}
            serverId={serverId}
            onOpenProfile={onOpenProfile}
          />
        )}
      </div>
    </div>
  );
};

interface MessageItemProps {
  message: MessageType;
  showDate: boolean;
  showHeader: boolean;
  setReplyTo: (msg: MessageType) => void;
  onUsernameContextMenu: (
    e: React.MouseEvent,
    username: string,
    serverId: string,
    channelId: string,
    avatarElement?: Element | null,
  ) => void;
  onOpenProfile?: (username: string) => void;
  onIrcLinkClick?: (url: string) => void;
  onReactClick: (message: MessageType, buttonElement: Element) => void;
  joinChannel?: (serverId: string, channelName: string) => void;
  onReactionUnreact: (emoji: string, message: MessageType) => void;
  onOpenReactionModal: (
    message: MessageType,
    position: { x: number; y: number },
  ) => void;
  onDirectReaction: (emoji: string, message: MessageType) => void;
  serverId: string;
  channelId?: string;
  onRedactMessage?: (message: MessageType) => void;
  hideReply?: boolean;
}

// Helper function to get user metadata
const getUserMetadata = (username: string, serverId: string) => {
  // First check localStorage for saved metadata
  const savedMetadata = loadSavedMetadata();
  const serverMetadata = savedMetadata[serverId];
  if (serverMetadata?.[username]) {
    return serverMetadata[username];
  }

  // If not in localStorage, check if user is in any shared channels
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (!server) return null;

  // Search through all channels for this user
  for (const channel of server.channels) {
    const user = channel.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    if (user?.metadata && Object.keys(user.metadata).length > 0) {
      return user.metadata;
    }
  }

  return null;
};

// Helper function to get full user object from shared channels
const getUserFromChannels = (username: string, serverId: string) => {
  const state = useStore.getState();
  const server = state.servers.find((s) => s.id === serverId);
  if (!server) return null;

  // Search through all channels for this user
  for (const channel of server.channels) {
    const user = channel.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    if (user) {
      return user;
    }
  }

  return null;
};

export const MessageItem = (props: MessageItemProps) => {
  const {
    message,
    showDate,
    showHeader,
    setReplyTo,
    onUsernameContextMenu,
    onOpenProfile,
    onIrcLinkClick,
    onReactClick,
    joinChannel,
    onReactionUnreact,
    onOpenReactionModal,
    onDirectReaction,
    serverId,
    channelId,
    onRedactMessage,
    hideReply,
  } = props;
  const pmUserCache = useRef(new Map<string, User>());
  const isNarrowView = useMediaQuery();
  const isTouchDevice = useMediaQuery("(pointer: coarse)");
  const collapsibleRef = useRef<CollapsibleMessageHandle>(null);
  const [messageNeedsCollapsing, setMessageNeedsCollapsing] = useState(false);
  const messageRowRef = useRef<HTMLDivElement>(null);

  const handleMessageMouseEnter = () => {
    const el = messageRowRef.current;
    if (!el) return;
    const msgRect = el.getBoundingClientRect();
    // Toolbar: bottom-1 (4px from bottom), right-4 (16px from right), ~90px wide, ~32px tall
    const toolbarTop = msgRect.bottom - 4 - 32;
    const toolbarLeft = msgRect.right - 16 - 90;
    const toolbarRight = msgRect.right - 16;
    const toolbarBottom = msgRect.bottom - 4;

    for (const btn of el.querySelectorAll<HTMLElement>(
      ".copy-button, .inline-copy-button",
    )) {
      const r = btn.getBoundingClientRect();
      const overlaps =
        r.right > toolbarLeft &&
        r.left < toolbarRight &&
        r.bottom > toolbarTop &&
        r.top < toolbarBottom;
      if (overlaps) btn.classList.add("avoid-toolbar");
    }
  };

  const handleMessageMouseLeave = () => {
    for (const el of messageRowRef.current?.querySelectorAll(
      ".avoid-toolbar",
    ) ?? []) {
      el.classList.remove("avoid-toolbar");
    }
  };

  const ircCurrentUser = ircClient.getCurrentUser(message.serverId);
  const isCurrentUser = ircCurrentUser?.username === message.userId;

  // Get the user key using reactive selector
  const userKey = useStore(
    useCallback(
      (state) => {
        if (!serverId) return "none";

        if (!channelId) {
          const server = state.servers.find((s) => s.id === serverId);
          // Prefer channel user — covers current user who has no PrivateChat entry
          if (server) {
            const user = server.channels
              .flatMap((c) => c.users)
              .find(
                (u) =>
                  u.username.toLowerCase() === message.userId.toLowerCase(),
              );
            if (user) {
              return `channel-${user.id}`;
            }
          }
          const privateChat = server?.privateChats?.find(
            (pc) => pc.username === message.userId,
          );
          if (privateChat) {
            return `pm-${privateChat.id}`;
          }
          return "none";
        }

        const server = state.servers.find((s) => s.id === serverId);
        const channel = server?.channels.find((c) => c.id === channelId);
        const user = channel?.users.find(
          (user) => user.username === message.userId,
        );
        return user ? `channel-${user.id}` : "none";
      },
      [serverId, channelId, message.userId],
    ),
  );

  const rawMessageUser = useStore(
    useCallback(
      (state) => {
        if (userKey === "none") return undefined;

        if (userKey.startsWith("pm-")) {
          const privateChatId = userKey.slice(3);
          const privateChat = state.servers
            .find((s) => s.id === serverId)
            ?.privateChats?.find((pc) => pc.id === privateChatId);
          if (privateChat) return privateChat;
        } else if (userKey.startsWith("channel-")) {
          const userId = userKey.slice(8);
          const server = state.servers.find((s) => s.id === serverId);
          if (channelId) {
            const channel = server?.channels.find((c) => c.id === channelId);
            return channel?.users.find((user) => user.id === userId);
          }
          // DM context: no channelId, search all channels
          return server?.channels
            .flatMap((c) => c.users)
            .find((user) => user.id === userId);
        }

        return undefined;
      },
      [userKey, serverId, channelId],
    ),
  );

  const metadataChangeCounter = useStore(
    (state) => state.metadataChangeCounter,
  );

  // useMemo instead of useStore — safe to read localStorage without infinite loop via useSyncExternalStore
  // biome-ignore lint/correctness/useExhaustiveDependencies: metadataChangeCounter is intentional reactive trigger
  const pmUserMetadata = useMemo(() => {
    if (!userKey.startsWith("pm-")) return null;
    const pmUsername = (rawMessageUser as PrivateChat)?.username;
    if (!pmUsername || !serverId) return null;
    return getUserMetadata(pmUsername, serverId);
  }, [metadataChangeCounter, userKey, rawMessageUser, serverId]);

  const messageUser: User | undefined = useMemo(() => {
    if (!rawMessageUser) return undefined;

    // For PM users, rawMessageUser is the privateChat object
    // We need to construct a proper User object
    if (userKey.startsWith("pm-")) {
      const privateChat = rawMessageUser as PrivateChat;
      const user: User = {
        id: privateChat.id,
        username: privateChat.username,
        realname: "",
        account: "",
        isOnline: privateChat.isOnline ?? true,
        isAway: privateChat.isAway ?? false,
        status: "",
        isBot: false,
        isIrcOp: false,
        metadata: pmUserMetadata || {},
      };
      return user;
    }

    // For channel users, rawMessageUser is already a proper User object
    return rawMessageUser as User;
  }, [rawMessageUser, pmUserMetadata, userKey]);

  const avatarUrl = messageUser?.metadata?.avatar?.value;
  const displayName = messageUser?.metadata?.["display-name"]?.value;
  const userColor = messageUser?.metadata?.color?.value;
  const userStatus = messageUser?.metadata?.status?.value;
  const isSystem = message.type === "system";
  const isBot =
    messageUser?.isBot ||
    messageUser?.metadata?.bot?.value === "true" ||
    message.tags?.bot === "";
  const isVerified = isUserVerified(message.userId, message.tags);
  const isIrcOp = messageUser?.isIrcOp || false;

  // Check if message redaction is supported and possible
  const server = useStore(
    useCallback(
      (state) => state.servers.find((s) => s.id === message.serverId),
      [message.serverId],
    ),
  );
  const showSafeMedia = useStore(
    useCallback((state) => state.globalSettings.showSafeMedia, []),
  );
  const showExternalContent = useStore(
    useCallback((state) => state.globalSettings.showExternalContent, []),
  );
  const enableMarkdownRendering = useStore(
    useCallback((state) => state.globalSettings.enableMarkdownRendering, []),
  );
  const canRedact =
    !isSystem &&
    isCurrentUser &&
    !!message.msgid &&
    !!server?.capabilities?.includes("draft/message-redaction") &&
    !!onRedactMessage;

  // message.content is already combined for multiline messages by the IRC client
  const messageContent = message.content;

  // Convert message content to React elements
  const htmlContent = processMarkdownInText(
    messageContent,
    showExternalContent,
    enableMarkdownRendering,
    message.id || message.msgid || "msg",
  );

  // Create collapsible content wrapper
  const collapsibleContent = (
    <CollapsibleMessage
      ref={collapsibleRef}
      content={htmlContent}
      hoverOnly={!isTouchDevice}
      onNeedsCollapsing={setMessageNeedsCollapsing}
    />
  );

  const theme = localStorage.getItem("theme") || "discord";
  const username = message.userId;

  // Strip IRC formatting codes so URL/image detection works even when the URL
  // is wrapped in bold, italic, underline, strikethrough, or color codes.
  const strippedContent = stripIrcFormatting(message.content);

  // All three "single URL" checks require no whitespace — a message with spaces
  // contains multiple URLs and must not be treated as a single image URL.
  const isSingleToken = !/\s/.test(strippedContent.trim());

  // Check if message is just an image URL from our filehost
  const isImageUrl =
    isSingleToken &&
    !!server?.filehost &&
    isUrlFromFilehost(strippedContent.trim(), server.filehost) &&
    (!!strippedContent.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i) ||
      strippedContent.includes("/images/")); // check for backend upload URLs

  // Check if message is just a GIF URL from GIPHY or Tenor
  const isGifUrl =
    isSingleToken &&
    (strippedContent.match(/media\d*\.giphy\.com\/media\//) ||
      strippedContent.includes("media.tenor.com/") ||
      strippedContent.includes("tenor.googleapis.com/") ||
      strippedContent.match(/tenor\.com\/view\//)) &&
    (strippedContent.match(/\.(gif)$/i) ||
      strippedContent.includes("/giphy.gif") ||
      strippedContent.includes("/tinygif") ||
      strippedContent.match(/tenor\.com\/view\//));

  // Check if message is just an external image URL (not from filehost)
  const isExternalImageUrl =
    isSingleToken &&
    !isImageUrl && // Not a filehost image
    !isGifUrl && // Not a GIF from specific services
    (strippedContent.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i) ||
      strippedContent.includes("/images/")) &&
    (strippedContent.startsWith("http://") ||
      strippedContent.startsWith("https://"));

  // Extract filehost image URLs embedded in messages with other text.
  // Commas are excluded from URL matches so "url1,url2" splits correctly.
  // Trailing punctuation (.!?;:)>]) is stripped after matching.
  const embeddedFilehostImages = useMemo(() => {
    if (!server?.filehost || !showSafeMedia || isImageUrl) return [];
    const urlRegex = /https?:\/\/[^\s,]+/gi;
    const urls = (strippedContent.match(urlRegex) ?? []).map((url) =>
      url.replace(/[.,!?;:)>\]]+$/, ""),
    );
    return urls.filter(
      (url) =>
        server.filehost &&
        isUrlFromFilehost(url, server.filehost) &&
        (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url) ||
          url.includes("/images/")),
    );
  }, [strippedContent, server?.filehost, showSafeMedia, isImageUrl]);

  const [showAllImages, setShowAllImages] = useState(false);

  // Handle system messages
  if (isSystem) {
    return <SystemMessage message={message} onIrcLinkClick={onIrcLinkClick} />;
  }

  // Handle whisper messages (messages with draft/channel-context tag)
  // Note: Client tags use + prefix
  if (
    message.tags?.["draft/channel-context"] ||
    message.tags?.["+draft/channel-context"]
  ) {
    return (
      <>
        {showDate && (
          <DateSeparator date={new Date(message.timestamp)} theme={theme} />
        )}
        <WhisperMessage
          message={message}
          showDate={showDate}
          showHeader={showHeader}
          messageUser={messageUser}
          setReplyTo={setReplyTo}
          onUsernameContextMenu={onUsernameContextMenu}
          onIrcLinkClick={onIrcLinkClick}
          onReactClick={onReactClick}
          onReactionUnreact={onReactionUnreact}
          onDirectReaction={onDirectReaction}
          onRedactMessage={onRedactMessage}
          canRedact={canRedact}
          ircCurrentUser={ircCurrentUser || undefined}
        />
      </>
    );
  }

  // Handle event messages (join, part, quit, nick, mode, kick)
  if (["join", "part", "quit", "nick", "mode", "kick"].includes(message.type)) {
    return (
      <>
        {showDate && (
          <DateSeparator date={new Date(message.timestamp)} theme={theme} />
        )}
        <EventMessage
          message={message}
          messageUser={messageUser}
          showDate={showDate}
          onUsernameContextMenu={onUsernameContextMenu}
        />
      </>
    );
  }

  // Handle invite messages
  if (message.type === "invite") {
    return (
      <>
        {showDate && (
          <DateSeparator date={new Date(message.timestamp)} theme={theme} />
        )}
        <InviteMessage
          message={message}
          messageUser={messageUser}
          onUsernameContextMenu={onUsernameContextMenu}
          joinChannel={joinChannel}
        />
      </>
    );
  }

  // Handle standard reply messages
  if (message.type === "standard-reply") {
    // Ensure all required standard reply properties are present
    if (
      message.standardReplyType &&
      message.standardReplyCommand &&
      message.standardReplyCode &&
      message.standardReplyMessage
    ) {
      return (
        <>
          {showDate && (
            <DateSeparator date={new Date(message.timestamp)} theme={theme} />
          )}
          <StandardReplyNotification
            type={message.standardReplyType}
            command={message.standardReplyCommand}
            code={message.standardReplyCode}
            message={message.standardReplyMessage}
            target={message.standardReplyTarget}
            timestamp={new Date(message.timestamp)}
            onIrcLinkClick={onIrcLinkClick}
          />
        </>
      );
    }
  }

  // Handle ACTION messages
  if (message.content.substring(0, 7) === "\u0001ACTION") {
    return (
      <>
        {showDate && (
          <DateSeparator date={new Date(message.timestamp)} theme={theme} />
        )}
        <ActionMessage
          message={message}
          showDate={showDate}
          messageUser={messageUser}
          onUsernameContextMenu={onUsernameContextMenu}
          setReplyTo={setReplyTo}
          onReactClick={onReactClick}
          onReactionUnreact={onReactionUnreact}
          onDirectReaction={onDirectReaction}
          isTouchDevice={isTouchDevice}
          isNarrowView={isNarrowView}
        />
      </>
    );
  }

  // Handle JSON log notices
  if (message.type === "notice" && message.jsonLogData) {
    return (
      <JsonLogMessage
        message={message}
        showDate={showDate}
        messageUser={messageUser}
        onUsernameContextMenu={onUsernameContextMenu}
        onIrcLinkClick={onIrcLinkClick}
        joinChannel={joinChannel}
      />
    );
  }

  // Handle regular messages
  const handleReactionClick = (emoji: string, currentUserReacted: boolean) => {
    if (currentUserReacted) {
      onReactionUnreact(emoji, message);
    } else {
      onDirectReaction(emoji, message);
    }
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    if (message.userId !== "system") {
      onUsernameContextMenu(
        e,
        username,
        message.serverId,
        message.channelId,
        e.currentTarget,
      );
    }
  };

  const handleUsernameClick = (e: React.MouseEvent) => {
    if (message.userId !== "system") {
      // Find the avatar element to position menu over it
      const messageElement = e.currentTarget.closest(".flex");
      const avatarElement = messageElement?.querySelector(".mr-4");
      onUsernameContextMenu(
        e,
        username,
        message.serverId,
        message.channelId,
        avatarElement,
      );
    }
  };

  const handleReplyUsernameClick = (e: React.MouseEvent) => {
    if (message.replyMessage) {
      // Find the avatar element to position menu over it
      const messageElement = e.currentTarget.closest(".flex");
      const avatarElement = messageElement?.querySelector(".mr-4");
      onUsernameContextMenu(
        e,
        message.replyMessage.userId,
        message.serverId,
        message.channelId,
        avatarElement,
      );
    }
  };

  const handleScrollToReply = () => {
    if (!message.replyMessage?.id) return;

    const targetElement = document.querySelector(
      `[data-message-id="${message.replyMessage.id}"]`,
    );

    if (targetElement) {
      // Scroll to the message
      targetElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      // Add flash animation
      targetElement.classList.add("message-flash");

      // Remove the class after animation completes
      setTimeout(() => {
        targetElement.classList.remove("message-flash");
      }, 2000);
    }
  };

  const isClickable =
    message.userId !== "system" && ircCurrentUser?.username !== username;

  return (
    <div
      ref={messageRowRef}
      data-message-id={message.id}
      className={`px-4 hover:bg-discord-message-hover group relative transition-colors duration-300 ${
        showHeader ? "mt-4" : "py-0.5"
      }`}
      onMouseEnter={handleMessageMouseEnter}
      onMouseLeave={handleMessageMouseLeave}
    >
      {showDate && (
        <DateSeparator date={new Date(message.timestamp)} theme={theme} />
      )}

      <SwipeableMessage
        onReply={() => setReplyTo(message)}
        onReact={(el) => onReactClick(message, el)}
        onDelete={canRedact ? () => onRedactMessage?.(message) : undefined}
        onTap={
          messageNeedsCollapsing && isTouchDevice
            ? () => collapsibleRef.current?.toggle()
            : undefined
        }
        canReply={!hideReply && message.type === "message"}
        canDelete={canRedact}
        isNarrowView={isTouchDevice}
      >
        <div className="flex">
          <MessageAvatar
            userId={message.userId}
            avatarUrl={avatarUrl}
            userStatus={userStatus}
            isAway={messageUser?.isAway}
            theme={theme}
            showHeader={showHeader}
            onClick={handleAvatarClick}
            isClickable={isClickable}
            serverId={message.serverId}
          />

          <div
            className={`flex-1 min-w-0 relative ${isCurrentUser ? "text-white" : "text-discord-text-normal"}`}
          >
            {showHeader && (
              <MessageHeader
                userId={message.userId}
                displayName={displayName}
                userColor={userColor}
                timestamp={new Date(message.timestamp)}
                theme={theme}
                isClickable={isClickable}
                onClick={handleUsernameClick}
                isBot={isBot}
                isVerified={isVerified}
                isIrcOp={isIrcOp}
              />
            )}

            <div className="relative min-w-0">
              {message.replyMessage && (
                <MessageReply
                  replyMessage={message.replyMessage}
                  theme={theme}
                  onUsernameClick={handleReplyUsernameClick}
                  onIrcLinkClick={onIrcLinkClick}
                  onReplyClick={handleScrollToReply}
                />
              )}

              <EnhancedLinkWrapper onIrcLinkClick={onIrcLinkClick}>
                {(isImageUrl && showSafeMedia) ||
                (isGifUrl && showExternalContent) ||
                (isExternalImageUrl && showExternalContent) ? (
                  <ImageWithFallback
                    url={strippedContent}
                    msgid={message.msgid}
                    isFilehostImage={isImageUrl}
                    serverId={message.serverId}
                    channelId={channelId}
                    onOpenProfile={onOpenProfile}
                  />
                ) : (
                  <div
                    className="overflow-hidden"
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                  >
                    {collapsibleContent}
                  </div>
                )}
              </EnhancedLinkWrapper>

              {/* Render embedded filehost image previews — first always visible,
                  rest collapsed behind a "show more" toggle to prevent floods */}
              {embeddedFilehostImages.length > 0 && (
                <div>
                  <ImageWithFallback
                    url={embeddedFilehostImages[0]}
                    msgid={message.msgid}
                    isFilehostImage
                    serverId={message.serverId}
                    channelId={channelId}
                    onOpenProfile={onOpenProfile}
                  />
                  {embeddedFilehostImages.length > 1 &&
                    (showAllImages ? (
                      <>
                        {embeddedFilehostImages.slice(1).map((imgUrl) => (
                          <ImageWithFallback
                            key={imgUrl}
                            url={imgUrl}
                            msgid={message.msgid}
                            isFilehostImage
                            serverId={message.serverId}
                            channelId={channelId}
                            onOpenProfile={onOpenProfile}
                          />
                        ))}
                        <button
                          type="button"
                          className="mt-1 text-xs text-discord-text-muted hover:text-discord-text cursor-pointer underline"
                          onClick={() => setShowAllImages(false)}
                        >
                          Show less
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="mt-1 text-xs text-discord-text-muted hover:text-discord-text cursor-pointer underline"
                        onClick={() => setShowAllImages(true)}
                      >
                        Show {embeddedFilehostImages.length - 1} more image
                        {embeddedFilehostImages.length > 2 ? "s" : ""}
                      </button>
                    ))}
                </div>
              )}

              {/* Render link preview if available */}
              {(message.linkPreviewTitle ||
                message.linkPreviewSnippet ||
                message.linkPreviewMeta) && (
                <LinkPreview
                  title={message.linkPreviewTitle}
                  snippet={message.linkPreviewSnippet}
                  imageUrl={message.linkPreviewMeta}
                  theme={theme}
                  messageContent={message.content}
                />
              )}
            </div>

            <ReactionsWithActions
              message={message}
              currentUserUsername={ircCurrentUser?.username}
              onReactionClick={handleReactionClick}
              onReactClick={(el) => onReactClick(message, el)}
              onReplyClick={() => setReplyTo(message)}
              onRedactClick={
                canRedact ? () => onRedactMessage?.(message) : undefined
              }
              canRedact={canRedact}
              canReply={!hideReply && message.type === "message"}
            />
          </div>
        </div>
      </SwipeableMessage>
    </div>
  );
};
