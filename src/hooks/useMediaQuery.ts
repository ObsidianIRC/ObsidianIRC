import { useEffect, useState } from "react";

export function useMediaQuery(
  query = "(max-width: 768px)",
  debounceMs = 0,
): boolean {
  const [matches, setMatches] = useState(() => {
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
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
