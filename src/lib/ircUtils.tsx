import type React from "react";
/* eslint-disable no-control-regex */
import type { User } from "../types";

export function parseNamesResponse(namesResponse: string): User[] {
  const users: User[] = [];
  for (const name of namesResponse.split(" ")) {
    const regex = /([~&@%+]*)([^\s!]+)!/;
    const match = regex.exec(name);
    if (match) {
      console.log("match");
      const [_, prefix, username] = match;
      users.push({
        id: username,
        username,
        status: prefix,
        isOnline: true,
      });
    } else console.log("No match");
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

export function mircToHtml(text: string): React.ReactNode[] {
  const cc = [
    "#FFFFFF",
    "#000000",
    "#00009D",
    "#009300",
    "#FF0000",
    "#7F0000",
    "#9C009C",
    "#FC7F00",
    "#FFFF00",
    "#00FC00",
    "#009393",
    "#00FFFF",
    "#0000FC",
    "#FF00FF",
    "#7F7F7F",
    "#D2D2D2",
    "#470000",
    "#472100",
    "#474700",
    "#324700",
    "#004700",
    "#00472C",
    "#004747",
    "#002747",
    "#000047",
    "#2E0047",
    "#470047",
    "#47002A",
    "#740000",
    "#743A00",
    "#747400",
    "#517400",
    "#007400",
    "#007449",
    "#007474",
    "#004074",
    "#000074",
    "#4B0074",
    "#740074",
    "#740045",
    "#B50000",
    "#B56300",
    "#B5B500",
    "#7DB500",
    "#00B500",
    "#00B571",
    "#00B5B5",
    "#0063B5",
    "#0000B5",
    "#7500B5",
    "#B500B5",
    "#B5006B",
    "#FF0000",
    "#FF8C00",
    "#FFFF00",
    "#B2FF00",
    "#00FF00",
    "#00FFA0",
    "#00FFFF",
    "#008CFF",
    "#0000FF",
    "#A500FF",
    "#FF00FF",
    "#FF0098",
    "#FF5959",
    "#FFB459",
    "#FFFF71",
    "#CFFF60",
    "#6FFF6F",
    "#65FFC9",
    "#6DFFFF",
    "#59B4FF",
    "#5959FF",
    "#C459FF",
    "#FF66FF",
    "#FF59BC",
    "#FF9C9C",
    "#FFD39C",
    "#FFFF9C",
    "#E2FF9C",
    "#9CFF9C",
    "#9CFFDB",
    "#9CFFFF",
    "#9CD3FF",
    "#9C9CFF",
    "#DC9CFF",
    "#FF9CFF",
    "#FF94D3",
    "#000000",
    "#131313",
    "#282828",
    "#363636",
    "#4D4D4D",
    "#656565",
    "#818181",
    "#9F9F9F",
    "#BCBCBC",
    "#E2E2E2",
    "#FFFFFF",
    "inherit",
  ];

  const state = {
    bold: false,
    underline: false,
    italic: false,
    strikethrough: false,
    monospace: false,
    fg: cc.length,
    bg: cc.length,
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
      backgroundColor: state.bg < cc.length ? cc[state.bg] : undefined,
      color: state.fg < cc.length ? cc[state.fg] : undefined,
    };
  }

  const result: React.ReactNode[] = [];
  let currentStyle = buildStyle();
  let currentText = "";

  const controlChars = [
    String.fromCharCode(2), // \x02
    String.fromCharCode(31), // \x1f
    String.fromCharCode(22), // \x16
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
        case "\x16":
          [state.fg, state.bg] = [state.bg, state.fg];
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
            fg: cc.length,
            bg: cc.length,
          });
          break;
        default:
          if (part.startsWith("\x03")) {
            const [fg, bg] = part.slice(1).split(",").map(Number);
            state.fg = fg >= 0 && fg < cc.length ? fg : cc.length;
            state.bg = bg >= 0 && bg < cc.length ? bg : cc.length;
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
