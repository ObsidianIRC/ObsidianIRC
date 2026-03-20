import { useEffect, useState } from "react";

export function useMediaQuery(
  query = "(max-width: 768px)",
  debounceMs = 0,
): boolean {
  const getMatches = (q: string): boolean => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return false;
    }
    return window.matchMedia(q).matches;
  };

  const [matches, setMatches] = useState(() => getMatches(query));

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    let timeoutId: number | undefined;
    const handler = (event: MediaQueryListEvent) => {
      if (timeoutId) clearTimeout(timeoutId);

      timeoutId = window.setTimeout(() => {
        setMatches(event.matches);
      }, debounceMs);
    };

    mediaQuery.addEventListener("change", handler);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      mediaQuery.removeEventListener("change", handler);
    };
  }, [query, debounceMs]);

  return matches;
}
