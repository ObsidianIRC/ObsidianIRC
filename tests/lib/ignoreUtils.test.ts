import { describe, expect, it } from "vitest";
import {
  createIgnorePattern,
  isUserIgnored,
  isValidIgnorePattern,
  matchesIgnorePattern,
} from "../../src/lib/ignoreUtils";

describe("ignoreUtils", () => {
  describe("matchesIgnorePattern", () => {
    it("should match exact patterns", () => {
      expect(
        matchesIgnorePattern("nick!user@host.com", "nick!user@host.com"),
      ).toBe(true);
      expect(
        matchesIgnorePattern("nick!user@host.com", "different!user@host.com"),
      ).toBe(false);
    });

    it("should match wildcard patterns", () => {
      expect(matchesIgnorePattern("baduser!user@host.com", "baduser!*@*")).toBe(
        true,
      );
      expect(
        matchesIgnorePattern("anynick!baduser@host.com", "*!baduser@*"),
      ).toBe(true);
      expect(
        matchesIgnorePattern("nick!user@badhost.com", "*!*@badhost.com"),
      ).toBe(true);
      expect(
        matchesIgnorePattern("nick!user@sub.badhost.com", "*!*@*.badhost.com"),
      ).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(
        matchesIgnorePattern("NICK!USER@HOST.COM", "nick!user@host.com"),
      ).toBe(true);
      expect(
        matchesIgnorePattern("nick!user@host.com", "NICK!USER@HOST.COM"),
      ).toBe(true);
    });

    it("should handle invalid patterns gracefully", () => {
      expect(
        matchesIgnorePattern("nick!user@host.com", "invalid[pattern"),
      ).toBe(false);
    });
  });

  describe("isUserIgnored", () => {
    const ignoreList = [
      "baduser!*@*",
      "*!spammer@*",
      "*!*@badhost.com",
      "exact!match@host.net",
    ];

    it("should ignore users by nick", () => {
      expect(
        isUserIgnored("baduser", "anyuser", "anyhost.com", ignoreList),
      ).toBe(true);
      expect(
        isUserIgnored("gooduser", "anyuser", "anyhost.com", ignoreList),
      ).toBe(false);
    });

    it("should ignore users by username", () => {
      expect(
        isUserIgnored("anynick", "spammer", "anyhost.com", ignoreList),
      ).toBe(true);
      expect(
        isUserIgnored("anynick", "gooduser", "anyhost.com", ignoreList),
      ).toBe(false);
    });

    it("should ignore users by host", () => {
      expect(
        isUserIgnored("anynick", "anyuser", "badhost.com", ignoreList),
      ).toBe(true);
      expect(
        isUserIgnored("anynick", "anyuser", "goodhost.com", ignoreList),
      ).toBe(false);
    });

    it("should handle partial information", () => {
      expect(isUserIgnored("baduser", undefined, undefined, ignoreList)).toBe(
        true,
      );
      expect(isUserIgnored("anynick", "spammer", undefined, ignoreList)).toBe(
        true,
      );
      expect(
        isUserIgnored("anynick", undefined, "badhost.com", ignoreList),
      ).toBe(true);
    });

    it("should handle empty ignore list", () => {
      expect(isUserIgnored("baduser", "spammer", "badhost.com", [])).toBe(
        false,
      );
    });
  });

  describe("isValidIgnorePattern", () => {
    it("should validate correct patterns", () => {
      expect(isValidIgnorePattern("nick!user@host")).toBe(true);
      expect(isValidIgnorePattern("*!*@*")).toBe(true);
      expect(isValidIgnorePattern("baduser!*@*")).toBe(true);
      expect(isValidIgnorePattern("*!spammer@*")).toBe(true);
      expect(isValidIgnorePattern("*!*@badhost.com")).toBe(true);
      expect(isValidIgnorePattern("nick123!user_name@sub.domain.com")).toBe(
        true,
      );
    });

    it("should reject invalid patterns", () => {
      expect(isValidIgnorePattern("")).toBe(false);
      expect(isValidIgnorePattern("   ")).toBe(false);
      expect(isValidIgnorePattern("nick@host")).toBe(false); // missing !
      expect(isValidIgnorePattern("nick!user")).toBe(false); // missing @
      expect(isValidIgnorePattern("nick!user@")).toBe(false); // empty host
      expect(isValidIgnorePattern("!user@host")).toBe(false); // empty nick
      expect(isValidIgnorePattern("nick!@host")).toBe(false); // empty user
      expect(isValidIgnorePattern("nick!user@host!extra")).toBe(false); // too many !
      expect(isValidIgnorePattern("nick!user@host@extra")).toBe(false); // too many @
    });
  });

  describe("createIgnorePattern", () => {
    it("should create patterns with all components", () => {
      expect(createIgnorePattern("nick", "user", "host")).toBe(
        "nick!user@host",
      );
    });

    it("should use wildcards for missing components", () => {
      expect(createIgnorePattern("nick")).toBe("nick!*@*");
      expect(createIgnorePattern(undefined, "user")).toBe("*!user@*");
      expect(createIgnorePattern(undefined, undefined, "host")).toBe(
        "*!*@host",
      );
      expect(createIgnorePattern("nick", "user")).toBe("nick!user@*");
    });

    it("should handle empty strings", () => {
      expect(createIgnorePattern("", "", "")).toBe("*!*@*");
      expect(createIgnorePattern("nick", "", "")).toBe("nick!*@*");
    });
  });
});
