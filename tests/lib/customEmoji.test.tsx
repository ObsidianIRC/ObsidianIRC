import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmojiPackCache,
  fetchEmojiPacks,
  renderWithCustomEmoji,
} from "../../src/lib/customEmoji";

describe("customEmoji", () => {
  describe("renderWithCustomEmoji", () => {
    const renderText = (s: string, key: string) => <span key={key}>{s}</span>;

    it("returns the renderText output unchanged when no shortcodes match", () => {
      const out = renderWithCustomEmoji(
        "hello world",
        () => null,
        renderText,
        "k",
      );
      const html = renderToStaticMarkup(<>{out}</>);
      expect(html).toBe("<span>hello world</span>");
    });

    it("substitutes a single :shortcode: with an <img>", () => {
      const out = renderWithCustomEmoji(
        "hi :smile: there",
        (sc) => (sc === "smile" ? { url: "https://x/y.png" } : null),
        renderText,
        "k",
      );
      const html = renderToStaticMarkup(<>{out}</>);
      expect(html).toContain('src="https://x/y.png"');
      expect(html).toContain('alt=":smile:"');
      expect(html).toContain("<span>hi </span>");
      expect(html).toContain("<span> there</span>");
    });

    it("leaves unknown :shortcodes: as plain text", () => {
      const out = renderWithCustomEmoji(
        "hi :nope: there",
        () => null,
        renderText,
        "k",
      );
      const html = renderToStaticMarkup(<>{out}</>);
      expect(html).toBe("<span>hi :nope: there</span>");
      expect(html).not.toContain("<img");
    });

    it("uses provided alt text when present", () => {
      const out = renderWithCustomEmoji(
        ":party:",
        () => ({ url: "u", alt: "Party!" }),
        renderText,
        "k",
      );
      const html = renderToStaticMarkup(<>{out}</>);
      expect(html).toContain('alt="Party!"');
    });

    it("substitutes multiple shortcodes in one string", () => {
      const out = renderWithCustomEmoji(
        "a :one: b :two: c",
        (sc) => ({ url: `https://x/${sc}.png` }),
        renderText,
        "k",
      );
      const html = renderToStaticMarkup(<>{out}</>);
      expect(html).toContain("https://x/one.png");
      expect(html).toContain("https://x/two.png");
    });
  });

  describe("fetchEmojiPacks", () => {
    beforeEach(() => {
      clearEmojiPackCache();
    });
    afterEach(() => {
      vi.restoreAllMocks();
      clearEmojiPackCache();
    });

    it("dedupes concurrent fetches for the same URL", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "p", name: "P", emoji: { smile: { url: "u" } } },
        ],
      } as unknown as Response);

      const [a, b] = await Promise.all([
        fetchEmojiPacks("https://x/pack.json"),
        fetchEmojiPacks("https://x/pack.json"),
      ]);

      expect(a).toEqual(b);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("returns null on HTTP error and caches the failure", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      const out = await fetchEmojiPacks("https://x/bad.json");
      expect(out).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call within TTL should not refetch
      await fetchEmojiPacks("https://x/bad.json");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("returns null and caches on network error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
      const out = await fetchEmojiPacks("https://x/err.json");
      expect(out).toBeNull();
    });
  });
});
