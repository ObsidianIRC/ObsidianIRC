import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTabCompletion } from "../../src/hooks/useTabCompletion";
import type { User } from "../../src/types";

const mockUsers: User[] = [
  { id: "1", username: "alice", isOnline: true },
  { id: "2", username: "bob", isOnline: true },
  { id: "3", username: "charlie", isOnline: false },
  { id: "4", username: "david", isOnline: true },
  { id: "5", username: "admin", isOnline: true },
  { id: "6", username: "beta", isOnline: true },
];

describe("useTabCompletion", () => {
  let hook: ReturnType<
    typeof renderHook<ReturnType<typeof useTabCompletion>, unknown>
  >;

  beforeEach(() => {
    hook = renderHook(() => useTabCompletion());
  });

  it("should initialize with inactive state", () => {
    expect(hook.result.current.isActive).toBe(false);
    expect(hook.result.current.matches).toEqual([]);
    expect(hook.result.current.currentIndex).toBe(0);
  });

  describe("initial tab completion", () => {
    it("should start completion for partial nickname at beginning of message", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "ali",
          3,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "alice: ",
          newCursorPosition: 7,
        });
      });

      expect(hook.result.current.isActive).toBe(true);
      expect(hook.result.current.matches).toEqual(["alice: "]);
      expect(hook.result.current.currentIndex).toBe(0);
    });

    it("should start completion for partial nickname in middle of message", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "hello ali",
          9,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "hello alice ",
          newCursorPosition: 12,
        });
      });

      expect(hook.result.current.isActive).toBe(true);
      expect(hook.result.current.matches).toEqual(["alice "]);
    });

    it("should find multiple matches and start with first alphabetically", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "a",
          1,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "admin: ",
          newCursorPosition: 7,
        });
      });

      expect(hook.result.current.isActive).toBe(true);
      expect(hook.result.current.matches).toEqual(["admin: ", "alice: "]);
      expect(hook.result.current.currentIndex).toBe(0);
    });

    it("should return null for no matches", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "xyz",
          3,
          mockUsers,
        );
        expect(result).toBe(null);
      });

      expect(hook.result.current.isActive).toBe(false);
    });

    it("should return null for empty input", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "",
          0,
          mockUsers,
        );
        expect(result).toBe(null);
      });

      expect(hook.result.current.isActive).toBe(false);
    });

    it("should ignore exact matches", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "alice",
          5,
          mockUsers,
        );
        expect(result).toBe(null);
      });

      expect(hook.result.current.isActive).toBe(false);
    });
  });

  describe("cycling through completions", () => {
    it("should cycle to next match on subsequent tabs", () => {
      act(() => {
        hook.result.current.handleTabCompletion("a", 1, mockUsers);
      });

      expect(hook.result.current.currentIndex).toBe(0);
      expect(hook.result.current.matches[0]).toBe("admin: ");

      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "admin: ",
          7,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "alice: ",
          newCursorPosition: 7,
        });
      });

      expect(hook.result.current.currentIndex).toBe(1);

      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "alice: ",
          7,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "admin: ",
          newCursorPosition: 7,
        });
      });

      expect(hook.result.current.currentIndex).toBe(0);
    });

    it("should handle single match cycling", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "bo",
          2,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "bob: ",
          newCursorPosition: 5,
        });
      });

      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "bob: ",
          5,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "bob: ",
          newCursorPosition: 5,
        });
      });

      expect(hook.result.current.currentIndex).toBe(0);
    });
  });

  describe("completion reset", () => {
    it("should reset completion manually", () => {
      act(() => {
        hook.result.current.resetCompletion();
      });

      expect(hook.result.current.isActive).toBe(false);
      expect(hook.result.current.matches).toEqual([]);
      expect(hook.result.current.currentIndex).toBe(0);
    });

    it("should reset completion when text changes unexpectedly", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "hello",
          5,
          mockUsers,
        );
        expect(result).toBe(null);
      });

      expect(hook.result.current.isActive).toBe(false);
    });
  });

  describe("case sensitivity", () => {
    it("should match case-insensitively", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "ALI",
          3,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "alice: ",
          newCursorPosition: 7,
        });
      });

      expect(hook.result.current.isActive).toBe(true);
    });

    it("should handle mixed case input", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "cHaR",
          4,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "charlie: ",
          newCursorPosition: 9,
        });
      });

      expect(hook.result.current.isActive).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle empty user list", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion("al", 2, []);
        expect(result).toBe(null);
      });

      expect(hook.result.current.isActive).toBe(false);
    });

    it("should handle cursor position at different locations", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "alice",
          3,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "alice: ce",
          newCursorPosition: 7,
        });
      });
    });

    it("should handle whitespace correctly", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "hello   ali",
          11,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "hello   alice ",
          newCursorPosition: 14,
        });
      });

      expect(hook.result.current.isActive).toBe(true);
    });

    it("should handle completion in complex message structure", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "hey alice, tell bo",
          18,
          mockUsers,
        );
        expect(result).toEqual({
          newText: "hey alice, tell bob ",
          newCursorPosition: 20,
        });
      });

      expect(hook.result.current.isActive).toBe(true);
      expect(hook.result.current.matches).toEqual(["bob "]);
    });
  });

  describe("colon suffix behavior", () => {
    it("should add colon when completing at message start", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "ali",
          3,
          mockUsers,
        );
        expect(result?.newText).toBe("alice: ");
      });
    });

    it("should add space when completing in middle of message", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "hello ali",
          9,
          mockUsers,
        );
        expect(result?.newText).toBe("hello alice ");
      });
    });

    it("should handle whitespace-only prefix correctly", () => {
      act(() => {
        const result = hook.result.current.handleTabCompletion(
          "   ali",
          6,
          mockUsers,
        );
        expect(result?.newText).toBe("   alice: ");
      });
    });
  });
});
