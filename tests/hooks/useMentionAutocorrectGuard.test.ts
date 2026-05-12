import { renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useMentionAutocorrectGuard } from "../../src/hooks/useMentionAutocorrectGuard";

function makeEvent(
  inputType: string,
  value: string,
  start: number,
  end: number,
): {
  event: FormEvent<HTMLTextAreaElement>;
  preventDefault: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const target = {
    value,
    selectionStart: start,
    selectionEnd: end,
  } as HTMLTextAreaElement;
  const event = {
    nativeEvent: { inputType } as InputEvent,
    currentTarget: target,
    preventDefault,
  } as unknown as FormEvent<HTMLTextAreaElement>;
  return { event, preventDefault };
}

describe("useMentionAutocorrectGuard", () => {
  it("cancels autocorrect when the selected word matches a member (case-insensitive)", () => {
    const { result } = renderHook(() =>
      useMentionAutocorrectGuard(["valware", "Alice"]),
    );
    const { event, preventDefault } = makeEvent(
      "insertReplacementText",
      "hello Valware",
      6,
      13,
    );
    result.current(event);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("allows autocorrect when the word is not a member", () => {
    const { result } = renderHook(() => useMentionAutocorrectGuard(["alice"]));
    const { event, preventDefault } = makeEvent(
      "insertReplacementText",
      "hello recieve",
      6,
      13,
    );
    result.current(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("ignores inputType other than insertReplacementText", () => {
    const { result } = renderHook(() =>
      useMentionAutocorrectGuard(["valware"]),
    );
    const { event, preventDefault } = makeEvent("insertText", "valware", 0, 7);
    result.current(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("ignores empty selections", () => {
    const { result } = renderHook(() =>
      useMentionAutocorrectGuard(["valware"]),
    );
    const { event, preventDefault } = makeEvent(
      "insertReplacementText",
      "valware",
      3,
      3,
    );
    result.current(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
