import type React from "react";
/* eslint-disable no-control-regex */
import type { User } from "../types";

export function parseNamesResponse(namesResponse: string): User[] {
  const users: User[] = [];
  for (const name of namesResponse.split(" ")) {
    const regex = /([~&@%+]*)([^\s!]+)!/;
    const match = regex.exec(name);
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
      tokenMap[key] = value;
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

export function mircToHtml(text: string): React.ReactNode[] {
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

  return result;
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
