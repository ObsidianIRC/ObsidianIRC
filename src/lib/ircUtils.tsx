import hljs from "highlight.js";
import { marked } from "marked";
import React from "react";
/* eslint-disable no-control-regex */
import type { Server, User } from "../types";

export function parseNamesResponse(namesResponse: string): User[] {
  const users: User[] = [];
  for (const name of namesResponse.split(" ")) {
    // Try to match with userhost format first (nick!user@host)
    let regex = /([~&@%+]*)([^\s!]+)!/;
    let match = regex.exec(name);

    if (!match) {
      // If no match, try without ! (just nickname)
      regex = /([~&@%+]*)([^\s!]+)/;
      match = regex.exec(name);
    }

    if (match) {
      const [_, prefix, username] = match;
      users.push({
        id: username,
        username,
        status: prefix,
        isOnline: true,
      });
    }
  }
  return users;
}

function parseStatus(
  prefix: string,
): "online" | "idle" | "dnd" | "offline" | undefined {
  if (prefix.includes("~")) return "online"; // Owner
  if (prefix.includes("@")) return "online"; // Admin
  if (prefix.includes("%")) return "idle"; // Half-op
  if (prefix.includes("+")) return "dnd"; // Voiced
  return "offline"; // Default
}

export function parseMessageTags(tags: string): Record<string, string> {
  const parsedTags: Record<string, string> = {};
  const tagPairs = tags.substring(1).split(";");

  for (const tag of tagPairs) {
    const [key, value] = tag.split("=");
    parsedTags[key] = value?.trim() ?? ""; // empty string fallback
  }

  return parsedTags;
}

/**
 * Check if a user is verified based on the account tag matching their nickname.
 * According to IRCv3 account-tag spec, if the account tag matches the sender's nick
 * (case-insensitively), the user is authenticated to that account.
 */
export function isUserVerified(
  senderNick: string,
  messageTags?: Record<string, string>,
): boolean {
  if (!messageTags?.account) {
    return false;
  }

  // Case-insensitive comparison as per the requirement
  return senderNick.toLowerCase() === messageTags.account.toLowerCase();
}

export function parseIsupport(tokens: string): Record<string, string> {
  const tokenMap: Record<string, string> = {};
  const tokenPairs = tokens.split(" ");

  for (const token of tokenPairs) {
    const [key, value] = token.split("=");
    if (value) {
      // Replace \x20 with actual space character
      tokenMap[key] = value.replace(/\\x20/g, " ");
    } else {
      tokenMap[key] = ""; // empty string fallback
    }
  }

  return tokenMap;
}

// Thanks to Talon

export const ircColors = [
  "#FFFFFF", // 0 - White
  "#000000", // 1 - Black
  "#00007F", // 2 - Blue (Navy)
  "#009300", // 3 - Green
  "#FF0000", // 4 - Red
  "#7F0000", // 5 - Brown (Maroon)
  "#9C009C", // 6 - Purple
  "#FC7F00", // 7 - Orange
  "#FFFF00", // 8 - Yellow
  "#00FC00", // 9 - Light Green
  "#009393", // 10 - Cyan
  "#00FFFF", // 11 - Light Cyan
  "#0000FC", // 12 - Light Blue
  "#FF00FF", // 13 - Pink
  "#7F7F7F", // 14 - Grey
  "#D2D2D2", // 15 - Light Grey
  "#470000", // 16
  "#472100", // 17
  "#474700", // 18
  "#324700", // 19
  "#004700", // 20
  "#00472C", // 21
  "#004747", // 22
  "#002747", // 23
  "#000047", // 24
  "#2E0047", // 25
  "#470047", // 26
  "#47002A", // 27
  "#740000", // 28
  "#743A00", // 29
  "#747400", // 30
  "#517400", // 31
  "#007400", // 32
  "#007449", // 33
  "#007474", // 34
  "#004074", // 35
  "#000074", // 36
  "#4B0074", // 37
  "#740074", // 38
  "#740045", // 39
  "#B50000", // 40
  "#B56300", // 41
  "#B5B500", // 42
  "#7DB500", // 43
  "#00B500", // 44
  "#00B571", // 45
  "#00B5B5", // 46
  "#0063B5", // 47
  "#0000B5", // 48
  "#7500B5", // 49
  "#B500B5", // 50
  "#B5006B", // 51
  "#FF000B", // 52
  "#FF8C00", // 53
  "#FFFF0B", // 54
  "#B2FF00", // 55
  "#00FF00", // 56
  "#00FFA0", // 57
  "#00FFFB", // 58
  "#008CFF", // 59
  "#0000FF", // 60
  "#A500FF", // 61
  "#FF00FB", // 62
  "#FF0098", // 63
  "#FF5959", // 64
  "#FFB459", // 65
  "#FFFF71", // 66
  "#CFFF60", // 67
  "#6FFF6F", // 68
  "#65FFC9", // 69
  "#6DFFFF", // 70
  "#59B4FF", // 71
  "#5959FF", // 72
  "#C459FF", // 73
  "#FF66FF", // 74
  "#FF59BC", // 75
  "#FF9C9C", // 76
  "#FFD39C", // 77
  "#FFFF9C", // 78
  "#E2FF9C", // 79
  "#9CFF9C", // 80
  "#9CFFDB", // 81
  "#9CFFFF", // 82
  "#9CD3FF", // 83
  "#9C9CFF", // 84
  "#DC9CFF", // 85
  "#FF9CFF", // 86
  "#FF94D3", // 87
  "#00000A", // 88
  "#131313", // 89
  "#282828", // 90
  "#363636", // 91
  "#4D4D4D", // 92
  "#656565", // 93
  "#818181", // 94
  "#9F9F9F", // 95
  "#BCBCBC", // 96
  "#E2E2E2", // 97
  "#FFFFFF", // 98
  "inherit", // 99 - Default (not universally supported)
];

export function renderMarkdown(
  text: string,
  showExternalContent = true,
): React.ReactNode {
  // Basic input validation and sanitization
  if (!text || typeof text !== "string") {
    return <span>{text || ""}</span>;
  }

  // Limit input length to prevent DoS
  const maxLength = 10000;
  if (text.length > maxLength) {
    return <span>{text.substring(0, maxLength)}...</span>;
  }

  // Configure marked for safe rendering with custom renderer
  const renderer = new marked.Renderer();

  // Custom image renderer that respects external content settings
  renderer.image = ({ href, title, text }) => {
    // Sanitize URL to prevent javascript: and other malicious protocols
    const sanitizedHref = href.replace(/^(javascript|data|vbscript):/i, "#");

    if (!showExternalContent) {
      // Return a placeholder or link instead of the image
      return `<a href="${sanitizedHref}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 underline">[Image: ${text || sanitizedHref}]</a>`;
    }
    // Allow the image to render normally, but make it clickable
    const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
    const altAttr = ` alt="${(text || "").replace(/"/g, "&quot;")}"`;
    const imageHtml = `<img src="${sanitizedHref}"${altAttr}${titleAttr} class="max-w-full h-auto rounded-lg cursor-pointer" style="max-height: 150px;" />`;

    // Add special class for external links that need security warnings
    const isExternalLink =
      sanitizedHref.startsWith("http://") ||
      sanitizedHref.startsWith("https://");
    const linkClass = isExternalLink ? "external-link-security" : "";

    return `<a href="${sanitizedHref}" target="_blank" rel="noopener noreferrer" class="${linkClass}">${imageHtml}</a>`;
  };

  // Custom link renderer to sanitize URLs
  renderer.link = ({ href, title, text }) => {
    // Sanitize URL to prevent javascript: and other malicious protocols
    const sanitizedHref = href.replace(/^(javascript|data|vbscript):/i, "#");
    const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";

    // Add special class for external links that need security warnings
    const isExternalLink =
      sanitizedHref.startsWith("http://") ||
      sanitizedHref.startsWith("https://");
    const linkClass = isExternalLink
      ? "text-blue-500 hover:text-blue-700 underline external-link-security"
      : "text-blue-500 hover:text-blue-700 underline";

    return `<a href="${sanitizedHref}"${titleAttr} target="_blank" rel="noopener noreferrer" class="${linkClass}">${text}</a>`;
  };

  // Custom code renderer for inline code
  renderer.codespan = ({ text }) => {
    // Decode HTML entities back to characters for inline code
    const decodedText = text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");

    const codeId = `inline-code-${Math.random().toString(36).substr(2, 9)}`;
    return `<span class="inline-code-container"><code id="${codeId}" class="inline-code">${decodedText}</code><button class="inline-copy-button" data-code-id="${codeId}" title="Copy to clipboard">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button></span>`;
  };

  // Custom code block renderer
  renderer.code = ({ text, lang }) => {
    // Trim trailing whitespace/newlines that might be part of markdown formatting
    const trimmedText = text.trimEnd();

    // Decode HTML entities back to characters for code blocks
    const decodedText = trimmedText
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");

    let highlightedCode = decodedText;
    let language = lang;

    if (lang && hljs.getLanguage(lang)) {
      try {
        const result = hljs.highlight(decodedText, { language: lang });
        highlightedCode = result.value;
        language = result.language;
      } catch (err) {
        // Fallback to auto-detection if specific language fails
        try {
          const result = hljs.highlightAuto(decodedText);
          highlightedCode = result.value;
          language = result.language;
        } catch (autoErr) {
          // If highlighting fails, use the decoded text
          highlightedCode = decodedText;
        }
      }
    } else if (lang) {
      // Language specified but not supported, still use decoded text
      highlightedCode = decodedText;
    } else {
      // No language specified, try auto-detection
      try {
        const result = hljs.highlightAuto(decodedText);
        highlightedCode = result.value;
        language = result.language;
      } catch (autoErr) {
        // If auto-detection fails, use decoded text
        highlightedCode = decodedText;
      }
    }

    const languageClass = language ? ` class="language-${language}"` : "";
    return `<pre><code${languageClass}>${highlightedCode}</code></pre>`;
  };

  // Temporarily replace blockquote markers to preserve them during HTML escaping
  const blockquotePlaceholder = "__BLOCKQUOTE_MARKER__";
  const textWithPlaceholders = text.replace(
    /^> /gm,
    `${blockquotePlaceholder} `,
  );

  // Escape single-line tilde fenced code blocks (~~~lang code~~~) so they don't render as code
  const processedText = textWithPlaceholders.replace(
    /^~~~.*~~~$/gm,
    (match) => {
      // Escape the tildes so they render as literal text
      return match.replace(/~/g, "\\~");
    },
  );

  // Escape HTML tags in input so they render as text
  const escapedText = processedText.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Restore blockquote markers
  const finalText = escapedText.replace(
    new RegExp(blockquotePlaceholder, "g"),
    ">",
  );

  marked.setOptions({
    breaks: true,
    gfm: true,
    renderer: renderer,
  });

  // Parse markdown to HTML
  const html = marked.parse(finalText) as string;

  // Post-process HTML to add copy buttons to code blocks
  const processedHtml = html.replace(
    /<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g,
    (match, attrs, content) => {
      const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;

      // Extract language from class attribute (e.g., class="language-javascript")
      const languageMatch = attrs.match(/class="[^"]*language-([^"\s]+)/);
      const language = languageMatch ? languageMatch[1] : "text";
      const displayLanguage = language === "text" ? "plain text" : language;

      return `<div class="code-block-container"><div class="code-block-header">${displayLanguage}<button class="copy-button" data-code-id="${codeId}" title="Copy to clipboard"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></div><pre><code id="${codeId}"${attrs}>${content}</code></pre></div>`;
    },
  );

  // Return a div with dangerouslySetInnerHTML
  return (
    <div
      className="markdown-content"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized above
      dangerouslySetInnerHTML={{ __html: processedHtml }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const button =
          (target.closest(".copy-button") as HTMLButtonElement) ||
          (target.closest(".inline-copy-button") as HTMLButtonElement);
        if (button) {
          const codeId = button.getAttribute("data-code-id");
          if (codeId) {
            const codeElement = document.getElementById(codeId);
            if (codeElement) {
              const textToCopy = codeElement.textContent || "";
              navigator.clipboard
                .writeText(textToCopy)
                .then(() => {
                  // Show success feedback
                  const originalText = button.innerHTML;
                  button.innerHTML = `
                  <svg width="${button.classList.contains("inline-copy-button") ? "12" : "16"}" height="${button.classList.contains("inline-copy-button") ? "12" : "16"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20,6 9,17 4,12"></polyline>
                  </svg>
                `;
                  button.style.color = "#10b981";
                  setTimeout(() => {
                    button.innerHTML = originalText;
                    button.style.color = "";
                  }, 2000);
                })
                .catch((err) => {
                  console.error("Failed to copy text: ", err);
                  // Show error feedback
                  const originalText = button.innerHTML;
                  button.innerHTML = `
                  <svg width="${button.classList.contains("inline-copy-button") ? "12" : "16"}" height="${button.classList.contains("inline-copy-button") ? "12" : "16"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                `;
                  button.style.color = "#ef4444";
                  setTimeout(() => {
                    button.innerHTML = originalText;
                    button.style.color = "";
                  }, 2000);
                });
            }
          }
        }
      }}
    />
  );
}

export function processMarkdownInText(
  text: string,
  showExternalContent = true,
  enableMarkdown = false,
  keyPrefix = "",
): React.ReactNode {
  // Check if text contains markdown syntax patterns
  const markdownPatterns = [
    /^#{1,6}/m, // Headers (# ## ### etc.)
    /\*\*.*?\*\*/, // Bold (**text**)
    /\*.*?\*/, // Italic (*text*) or (*text*) but not single * at word boundaries
    /_.*?_/, // Italic (_text_)
    /`.*?`/, // Inline code
    /```[\s\S]*?```/, // Code blocks
    /~~~[\s\S]*?~~~/, // Tilde fenced code blocks
    /~~.*?~~/, // Strikethrough (~~text~~)
    /^\* /m, // Unordered lists
    /^\d+\. /m, // Ordered lists
    /^> /m, // Blockquotes
    /\[.*?\]\(.*?\)/, // Links [text](url)
    /!\[.*?\]\(.*?\)/, // Images ![alt](url)
    /^\|.*\|.*$/m, // Table rows
    /^[\s]*\|[\s]*:?-+:?[\s]*\|.*$/m, // Table separators
  ];

  const hasMarkdown = markdownPatterns.some((pattern) => pattern.test(text));

  if (hasMarkdown && enableMarkdown) {
    // If markdown syntax is detected and markdown is enabled, render the entire text as markdown
    return renderMarkdown(text, showExternalContent);
  }
  // Otherwise, use the existing IRC formatting
  return mircToHtml(text, keyPrefix);
}

export function mircToHtml(text: string, keyPrefix = ""): React.ReactNode {
  const state = {
    bold: false,
    underline: false,
    italic: false,
    strikethrough: false,
    monospace: false,
    fg: ircColors.length, // Default foreground (no color set)
    bg: ircColors.length, // Default background (no color set)
  };

  function buildStyle(): React.CSSProperties {
    return {
      fontWeight: state.bold ? "bold" : undefined,
      textDecoration: state.underline
        ? "underline"
        : state.strikethrough
          ? "line-through"
          : undefined,
      fontStyle: state.italic ? "italic" : undefined,
      fontFamily: state.monospace ? "monospace" : undefined,
      backgroundColor:
        state.bg < ircColors.length ? ircColors[state.bg] : undefined,
      color: state.fg < ircColors.length ? ircColors[state.fg] : undefined,
    };
  }

  const result: React.ReactNode[] = [];
  let currentStyle = buildStyle();
  let currentText = "";

  const controlChars = [
    String.fromCharCode(2), // \x02
    String.fromCharCode(31), // \x1f
    String.fromCharCode(29), // \x1d
    String.fromCharCode(30), // \x1e
    String.fromCharCode(17), // \x11
    String.fromCharCode(15), // \x0f
  ].join("");

  const regex = new RegExp(
    `(\\x03(?:\\d{1,2}(?:,\\d{1,2})?)?|[${controlChars}])`,
    "gu",
  );

  text.split(regex).forEach((part, index) => {
    if (index % 2 === 0) {
      // Regular text
      currentText += part;
    } else {
      // Control codes
      if (currentText) {
        // Push the accumulated text with the current style
        result.push(
          <span key={result.length} style={currentStyle}>
            {currentText}
          </span>,
        );
        currentText = "";
      }

      switch (part) {
        case "\x02":
          state.bold = !state.bold;
          break;
        case "\x1f":
          state.underline = !state.underline;
          break;
        case "\x1d":
          state.italic = !state.italic;
          break;
        case "\x1e":
          state.strikethrough = !state.strikethrough;
          break;
        case "\x11":
          state.monospace = !state.monospace;
          break;
        case "\x0f":
          Object.assign(state, {
            bold: false,
            underline: false,
            italic: false,
            strikethrough: false,
            monospace: false,
            fg: ircColors.length,
            bg: ircColors.length,
          });
          break;
        default:
          if (part.startsWith("\x03")) {
            const [fg, bg] = part.slice(1).split(",").map(Number);
            state.fg = fg >= 0 && fg < ircColors.length ? fg : ircColors.length;
            state.bg = bg >= 0 && bg < ircColors.length ? bg : ircColors.length;
          }
          break;
      }

      // Update the current style
      currentStyle = buildStyle();
    }
  });

  // Push any remaining text
  if (currentText) {
    result.push(
      <span key={result.length} style={currentStyle}>
        {currentText}
      </span>,
    );
  }

  // Process URLs in the result
  const processedResult: React.ReactNode[] = [];
  const elementIndexRef = { current: 0 };
  result.forEach((node, index) => {
    if (React.isValidElement(node) && node.type === "span") {
      const textContent = node.props.children;
      if (typeof textContent === "string") {
        const urlProcessed = processUrlsInText(
          textContent,
          node.props.style,
          keyPrefix,
          elementIndexRef,
        );
        processedResult.push(...urlProcessed);
      } else {
        processedResult.push(node);
      }
    } else {
      processedResult.push(node);
    }
  });

  return <>{processedResult}</>;
}

// Helper function to detect and render URLs in text
function processUrlsInText(
  text: string,
  style?: React.CSSProperties,
  keyPrefix = "",
  elementIndexRef?: { current: number },
): React.ReactNode[] {
  // URL regex pattern - matches http://, https://, and www. URLs
  const urlRegex =
    /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+)/gi;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let elementIndex = elementIndexRef ? elementIndexRef.current : 0;
  let match: RegExpExecArray | null = urlRegex.exec(text);

  while (match !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(
        <span key={`${keyPrefix}text-${elementIndex++}`} style={style}>
          {text.slice(lastIndex, match.index)}
        </span>,
      );
    }

    const url = match[0];
    // Ensure URL has protocol
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;

    // Truncate long URLs for display
    const displayText = url.length > 50 ? `${url.slice(0, 47)}...` : url;

    parts.push(
      <a
        key={`${keyPrefix}url-${elementIndex++}`}
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:text-blue-700 underline"
        style={style}
        title={url}
      >
        {displayText}
      </a>,
    );

    lastIndex = match.index + match[0].length;
    match = urlRegex.exec(text);
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`${keyPrefix}text-${elementIndex++}`} style={style}>
        {text.slice(lastIndex)}
      </span>,
    );
  }

  // Update the shared elementIndex if provided
  if (elementIndexRef) {
    elementIndexRef.current = elementIndex;
  }

  return parts.length > 0
    ? parts
    : [
        <span
          key={`${keyPrefix}text-${elementIndexRef ? elementIndexRef.current++ : 0}`}
          style={style}
        >
          {text}
        </span>,
      ];
}

// Utility function to get color style from metadata color value
export function getColorStyle(colorValue?: string): React.CSSProperties {
  if (!colorValue) return {};

  // If it's a hex color
  if (colorValue.startsWith("#")) {
    return { color: colorValue };
  }

  // If it's a named color
  if (colorValue.match(/^[a-zA-Z]+$/)) {
    return { color: colorValue };
  }

  // If it's an RGB/RGBA value
  if (colorValue.startsWith("rgb")) {
    return { color: colorValue };
  }

  // Default fallback
  return {};
}

/**
 * Get the display name for a channel, using metadata display-name if available
 * or falling back to the channel name with # prefix removed.
 */
export function getChannelDisplayName(
  channelName: string,
  metadata?: Record<string, { value: string | undefined; visibility: string }>,
): string {
  const displayName = metadata?.["display-name"]?.value;
  if (displayName) {
    return displayName;
  }
  // Remove the # prefix if present
  return channelName.replace(/^#/, "");
}

/**
 * Get the avatar URL for a channel from metadata, with optional size substitution
 */
export function getChannelAvatarUrl(
  metadata?: Record<string, { value: string | undefined; visibility: string }>,
  size?: number,
): string | undefined {
  const avatarUrl = metadata?.avatar?.value;
  if (!avatarUrl) {
    return undefined;
  }

  // If size is provided and URL contains {size} placeholder, substitute it
  if (size && avatarUrl.includes("{size}")) {
    return avatarUrl.replace("{size}", size.toString());
  }

  return avatarUrl;
}

/**
 * Check if a user has operator (or higher) permissions in a channel
 * Operator status is indicated by @ or higher (~, &, etc.) in the user's status string
 */
export function hasOpPermission(userStatus?: string): boolean {
  if (!userStatus) return false;

  // Check for op (@), admin (&), or owner (~) status
  // These are higher permissions than halfop (%) or voice (+)
  return (
    userStatus.includes("@") ||
    userStatus.includes("&") ||
    userStatus.includes("~")
  );
}

/**
 * Check if a URL is from a specific filehost using proper URL parsing
 * This is safer than using string.startsWith() as it properly handles URL components
 */
export function isUrlFromFilehost(
  avatarUrl: string,
  filehost: string,
): boolean {
  if (!avatarUrl || !filehost) return false;

  try {
    const avatarUrlObj = new URL(avatarUrl);
    const filehostUrl = new URL(filehost);

    // Check if origins match (protocol + host + port)
    if (avatarUrlObj.origin !== filehostUrl.origin) {
      return false;
    }

    // Check if the pathname starts with the filehost pathname
    // This handles cases where filehost might be a subdirectory
    return avatarUrlObj.pathname.startsWith(filehostUrl.pathname);
  } catch {
    // If URL parsing fails, fall back to false
    return false;
  }
}

/**
 * Checks if a server is running UnrealIRCd based on the RPL_YOURHOST response
 * @param server The server object to check
 * @returns true if the server is running UnrealIRCd, false otherwise
 */
export function isUnrealIRCd(server: Server): boolean {
  return server.isUnrealIRCd === true;
}
