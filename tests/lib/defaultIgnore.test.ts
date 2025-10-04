import { describe, expect, it } from "vitest";
import { isUserIgnored } from "../../src/lib/ignoreUtils";

describe("Default HistServ Ignore", () => {
  it("should ignore HistServ by default", () => {
    const defaultIgnoreList = ["HistServ!*@*"];

    // Test that HistServ messages would be ignored
    const result = isUserIgnored(
      "HistServ",
      "histserv",
      "services.example.org",
      defaultIgnoreList,
    );
    expect(result).toBe(true);
  });

  it("should not ignore regular users with default ignore list", () => {
    const defaultIgnoreList = ["HistServ!*@*"];

    // Test that regular users are not ignored
    const result = isUserIgnored(
      "alice",
      "alice_user",
      "user.example.com",
      defaultIgnoreList,
    );
    expect(result).toBe(false);
  });
});
