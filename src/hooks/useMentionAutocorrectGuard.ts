import type { FormEvent } from "react";
import { useCallback, useMemo, useRef } from "react";

/**
 * Cancels OS autocorrect when it would replace a token that case-folds to a
 * known channel member. iOS Safari: textarea fires `beforeinput` with
 * `inputType: "insertReplacementText"` and the textarea's selection is around
 * the word about to be replaced — cancelable via preventDefault.
 *
 * Android (Gboard/Samsung/SwiftKey) is best-effort: the same inputType fires
 * inconsistently because corrections are bound to IME composition. The
 * suggestion bar still shows alternatives so the user can pick the original.
 */
export function useMentionAutocorrectGuard(nicks: readonly string[]) {
  const nickSet = useMemo(() => {
    const s = new Set<string>();
    for (const n of nicks) if (n) s.add(n.toLowerCase());
    return s;
  }, [nicks]);

  const setRef = useRef(nickSet);
  setRef.current = nickSet;

  return useCallback((e: FormEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as InputEvent;
    if (native.inputType !== "insertReplacementText") return;
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (start === end) return;
    const original = ta.value.slice(start, end).toLowerCase();
    if (setRef.current.has(original)) e.preventDefault();
  }, []);
}
