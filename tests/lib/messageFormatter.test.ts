import { describe, expect, it } from "vitest";
import {
  applyIrcFormatting,
  type FormattingType,
  formatMessageForIrc,
  getIrcColorCode,
  getPreviewStyles,
  IRC_FORMATTING_CODES,
  isValidFormattingType,
  type MessageFormatting,
} from "../../src/lib/messageFormatter";

describe("messageFormatter", () => {
  describe("getIrcColorCode", () => {
    it("should return empty string for inherit color", () => {
      expect(getIrcColorCode("inherit")).toBe("");
    });

    it("should return color code for valid colors", () => {
      // Test with actual hex colors from ircColors array
      expect(getIrcColorCode("#FFFFFF")).toBe("\x0300"); // White - index 0
      expect(getIrcColorCode("#000000")).toBe("\x0301"); // Black - index 1
      expect(getIrcColorCode("#FF0000")).toBe("\x0304"); // Red - index 4
    });

    it("should return empty string for invalid colors", () => {
      expect(getIrcColorCode("invalidcolor")).toBe("");
      expect(getIrcColorCode("")).toBe("");
    });

    it("should format single-digit indices with leading zero", () => {
      // White is index 0, should be formatted as 00
      const result = getIrcColorCode("#FFFFFF");
      expect(result).toBe("\x0300");
      expect(result.length).toBe(3); // \x03 + 2 digits
    });
  });

  describe("applyIrcFormatting", () => {
    it("should apply bold formatting", () => {
      const result = applyIrcFormatting("test", ["bold"]);
      expect(result).toBe("\x02test\x02");
    });

    it("should apply italic formatting", () => {
      const result = applyIrcFormatting("test", ["italic"]);
      expect(result).toBe("\x1Dtest\x1D");
    });

    it("should apply underline formatting", () => {
      const result = applyIrcFormatting("test", ["underline"]);
      expect(result).toBe("\x1Ftest\x1F");
    });

    it("should apply strikethrough formatting", () => {
      const result = applyIrcFormatting("test", ["strikethrough"]);
      expect(result).toBe("\x1Etest\x1E");
    });

    it("should apply reverse formatting", () => {
      const result = applyIrcFormatting("test", ["reverse"]);
      expect(result).toBe("\x16test\x16");
    });

    it("should apply monospace formatting", () => {
      const result = applyIrcFormatting("test", ["monospace"]);
      expect(result).toBe("\x11test\x11");
    });

    it("should apply multiple formatting types", () => {
      const result = applyIrcFormatting("test", ["bold", "italic"]);
      // Formatting is applied in array order, so bold first, then italic wraps it
      expect(result).toBe("\x1D\x02test\x02\x1D");
    });

    it("should handle empty formatting array", () => {
      const result = applyIrcFormatting("test", []);
      expect(result).toBe("test");
    });

    it("should handle empty text", () => {
      const result = applyIrcFormatting("", ["bold"]);
      expect(result).toBe("\x02\x02");
    });
  });

  describe("formatMessageForIrc", () => {
    it("should format message with color only", () => {
      const options: MessageFormatting = {
        color: "#FF0000", // Red
        formatting: [],
      };
      const result = formatMessageForIrc("hello", options);

      // Should start with color code for red (index 4)
      expect(result).toBe("\x0304hello");
    });

    it("should format message with formatting only", () => {
      const options: MessageFormatting = {
        formatting: ["bold", "italic"],
      };
      const result = formatMessageForIrc("hello", options);

      expect(result).toBe("\x1D\x02hello\x02\x1D");
    });

    it("should format message with both color and formatting", () => {
      const options: MessageFormatting = {
        color: "#00007F", // Blue (Navy)
        formatting: ["bold"],
      };
      const result = formatMessageForIrc("hello", options);

      // Should have color code for blue (index 2) followed by formatted text
      expect(result).toBe("\x0302\x02hello\x02");
    });

    it("should handle inherit color with formatting", () => {
      const options: MessageFormatting = {
        color: "inherit",
        formatting: ["underline"],
      };
      const result = formatMessageForIrc("hello", options);

      expect(result).toBe("\x1Fhello\x1F");
    });

    it("should handle no color with formatting", () => {
      const options: MessageFormatting = {
        formatting: ["italic"],
      };
      const result = formatMessageForIrc("hello", options);

      expect(result).toBe("\x1Dhello\x1D");
    });

    it("should handle empty message", () => {
      const options: MessageFormatting = {
        color: "#FF0000", // Red
        formatting: ["bold"],
      };
      const result = formatMessageForIrc("", options);

      expect(result).toBe("\x0304\x02\x02");
    });
  });

  describe("getPreviewStyles", () => {
    it("should return styles for color only", () => {
      const options: MessageFormatting = {
        color: "red",
        formatting: [],
      };
      const styles = getPreviewStyles(options);

      expect(styles).toEqual({
        color: "red",
        fontWeight: "normal",
        fontStyle: "normal",
        textDecoration: "none",
        fontFamily: "inherit",
      });
    });

    it("should return styles for inherit color", () => {
      const options: MessageFormatting = {
        color: "inherit",
        formatting: [],
      };
      const styles = getPreviewStyles(options);

      expect(styles.color).toBe("inherit");
    });

    it("should return styles for bold formatting", () => {
      const options: MessageFormatting = {
        formatting: ["bold"],
      };
      const styles = getPreviewStyles(options);

      expect(styles.fontWeight).toBe("bold");
    });

    it("should return styles for italic formatting", () => {
      const options: MessageFormatting = {
        formatting: ["italic"],
      };
      const styles = getPreviewStyles(options);

      expect(styles.fontStyle).toBe("italic");
    });

    it("should return styles for underline formatting", () => {
      const options: MessageFormatting = {
        formatting: ["underline"],
      };
      const styles = getPreviewStyles(options);

      expect(styles.textDecoration).toBe("underline");
    });

    it("should return styles for strikethrough formatting", () => {
      const options: MessageFormatting = {
        formatting: ["strikethrough"],
      };
      const styles = getPreviewStyles(options);

      expect(styles.textDecoration).toBe("line-through");
    });

    it("should return styles for monospace formatting", () => {
      const options: MessageFormatting = {
        formatting: ["monospace"],
      };
      const styles = getPreviewStyles(options);

      expect(styles.fontFamily).toBe("monospace");
    });

    it("should prioritize underline over strikethrough", () => {
      const options: MessageFormatting = {
        formatting: ["underline", "strikethrough"],
      };
      const styles = getPreviewStyles(options);

      expect(styles.textDecoration).toBe("underline");
    });

    it("should handle multiple formatting types", () => {
      const options: MessageFormatting = {
        color: "blue",
        formatting: ["bold", "italic", "monospace"],
      };
      const styles = getPreviewStyles(options);

      expect(styles).toEqual({
        color: "blue",
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: "none",
        fontFamily: "monospace",
      });
    });
  });

  describe("isValidFormattingType", () => {
    it("should return true for valid formatting types", () => {
      const validTypes: FormattingType[] = [
        "bold",
        "italic",
        "underline",
        "strikethrough",
        "reverse",
        "monospace",
      ];

      validTypes.forEach((type) => {
        expect(isValidFormattingType(type)).toBe(true);
      });
    });

    it("should return false for invalid formatting types", () => {
      const invalidTypes = ["invalid", "blink", "shadow", "", "BOLD", "Bold"];

      invalidTypes.forEach((type) => {
        expect(isValidFormattingType(type)).toBe(false);
      });
    });
  });

  describe("IRC_FORMATTING_CODES", () => {
    it("should contain all expected formatting codes", () => {
      expect(IRC_FORMATTING_CODES.bold).toBe("\x02");
      expect(IRC_FORMATTING_CODES.italic).toBe("\x1D");
      expect(IRC_FORMATTING_CODES.underline).toBe("\x1F");
      expect(IRC_FORMATTING_CODES.strikethrough).toBe("\x1E");
      expect(IRC_FORMATTING_CODES.reverse).toBe("\x16");
      expect(IRC_FORMATTING_CODES.monospace).toBe("\x11");
      expect(IRC_FORMATTING_CODES.color).toBe("\x03");
      expect(IRC_FORMATTING_CODES.reset).toBe("\x0F");
    });
  });

  describe("integration tests", () => {
    it("should format complex message correctly", () => {
      const options: MessageFormatting = {
        color: "#FF0000", // Red
        formatting: ["bold", "underline"],
      };

      const result = formatMessageForIrc("Hello World!", options);

      // Should have color code + underline wrapping bold
      expect(result).toBe("\x0304\x1F\x02Hello World!\x02\x1F");
    });

    it("should provide consistent preview styles for formatted message", () => {
      const options: MessageFormatting = {
        color: "#009300", // Green
        formatting: ["bold", "italic"],
      };

      const styles = getPreviewStyles(options);

      expect(styles.color).toBe("#009300");
      expect(styles.fontWeight).toBe("bold");
      expect(styles.fontStyle).toBe("italic");
    });
  });
});
