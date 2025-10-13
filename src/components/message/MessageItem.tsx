import exifr from "exifr";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import ircClient from "../../lib/ircClient";
import { isUserVerified, mircToHtml } from "../../lib/ircUtils";
import useStore from "../../store";
import type { MessageType, User } from "../../types";
import { EnhancedLinkWrapper } from "../ui/LinkWrapper";
import { InviteMessage } from "./InviteMessage";
import {
  ActionMessage,
  DateSeparator,
  EventMessage,
  JsonLogMessage,
  LinkPreview,
  MessageActions,
  MessageAvatar,
  MessageHeader,
  MessageReactions,
  MessageReply,
  StandardReplyNotification,
  SystemMessage,
  WhisperMessage,
} from "./index";

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
  isFilehostImage?: boolean;
  serverId?: string;
  onOpenProfile?: (username: string) => void;
}> = ({ url, isFilehostImage = false, serverId, onOpenProfile }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
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
      <div className="relative inline-block">
        <img
          src={displayUrl}
          alt={isFilehostImage ? "Filehost image" : "GIF"}
          className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            window.open(url, "_blank"); // Always open original URL for sharing
          }}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          style={{ maxHeight: "150px" }}
        />
        {isFilehostImage && exifData && (
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
  users: User[];
  onRedactMessage?: (message: MessageType) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
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
  users,
  onRedactMessage,
}) => {
  const ircCurrentUser = ircClient.getCurrentUser(message.serverId);
  const isCurrentUser = ircCurrentUser?.username === message.userId;

  // Find the user for this message
  const messageUser = users.find(
    (user) => user.username === message.userId.split("-")[0],
  );
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

  // Check if message redaction is supported and possible
  const server = useStore
    .getState()
    .servers.find((s) => s.id === message.serverId);
  const canRedact =
    !isSystem &&
    isCurrentUser &&
    !!message.msgid &&
    !!server?.capabilities?.includes("draft/message-redaction") &&
    !!onRedactMessage;

  // Convert message content to React elements
  const htmlContent = mircToHtml(message.content);
  const theme = localStorage.getItem("theme") || "discord";
  const username = message.userId.split("-")[0];

  // Check if message is just an image URL from our filehost
  const isImageUrl =
    !!server?.filehost &&
    message.content.trim() === message.content &&
    message.content.startsWith(server.filehost) &&
    (!!message.content.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i) ||
      message.content.includes("/images/")); // check for backend upload URLs

  // Check if message is just a GIF URL from GIPHY or Tenor
  const isGifUrl =
    message.content.trim() === message.content &&
    (message.content.match(/media\d*\.giphy\.com\/media\//) ||
      message.content.includes("media.tenor.com/") ||
      message.content.includes("tenor.googleapis.com/") ||
      message.content.match(/tenor\.com\/view\//)) &&
    (message.content.match(/\.(gif)$/i) ||
      message.content.includes("/giphy.gif") ||
      message.content.includes("/tinygif") ||
      message.content.match(/tenor\.com\/view\//));

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
          users={users}
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
        message.replyMessage.userId.split("-")[0],
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
      data-message-id={message.id}
      className={`px-4 hover:bg-discord-message-hover group relative transition-colors duration-300 ${
        showHeader ? "py-2 mt-2" : "py-0.5"
      }`}
    >
      {showDate && (
        <DateSeparator date={new Date(message.timestamp)} theme={theme} />
      )}

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
        />

        <div className={`flex-1 relative ${isCurrentUser ? "text-white" : ""}`}>
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
            />
          )}

          <div className="relative">
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
              {isImageUrl || isGifUrl ? (
                <ImageWithFallback
                  url={message.content}
                  isFilehostImage={isImageUrl}
                  serverId={message.serverId}
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
                  {htmlContent}
                </div>
              )}
            </EnhancedLinkWrapper>

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

          <MessageReactions
            reactions={message.reactions}
            currentUserUsername={ircCurrentUser?.username}
            onReactionClick={handleReactionClick}
          />
        </div>

        <MessageActions
          message={message}
          onReplyClick={() => setReplyTo(message)}
          onReactClick={(buttonElement) => onReactClick(message, buttonElement)}
          onRedactClick={
            canRedact ? () => onRedactMessage?.(message) : undefined
          }
          canRedact={canRedact}
        />
      </div>
    </div>
  );
};
