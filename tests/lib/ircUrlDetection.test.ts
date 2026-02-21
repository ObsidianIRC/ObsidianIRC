import { describe, expect, it } from "vitest";
import { stripIrcFormatting } from "../../src/lib/messageFormatter";

// IRC formatting bytes
const BOLD = "\x02";
const COLOR = "\x03";
const ITALIC = "\x1D";
const UNDERLINE = "\x1F";
const STRIKETHROUGH = "\x1E";
const RESET = "\x0F";
const REVERSE = "\x16";
const MONOSPACE = "\x11";

// Replicates the exact logic used in LinkPreview.tsx
function extractUrlFromContent(messageContent: string): string | undefined {
  const cleanContent = stripIrcFormatting(messageContent).replace(/\*\*/g, "");
  const urlRegex = /\b(?:https?):\/\/[^\s<>"']+/i;
  const match = cleanContent.match(urlRegex);
  return match ? match[0] : undefined;
}

// Replicates the exact logic used in MessageItem.tsx
function isExternalImageUrl(content: string): boolean {
  const stripped = stripIrcFormatting(content);
  return (
    stripped.trim() === stripped &&
    !!stripped.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i) &&
    (stripped.startsWith("http://") || stripped.startsWith("https://"))
  );
}

// Replicates the exact logic used in embeddedFilehostImages useMemo
function extractEmbeddedUrls(content: string): string[] {
  const stripped = stripIrcFormatting(content);
  const urlRegex = /https?:\/\/\S+/gi;
  return stripped.match(urlRegex) ?? [];
}

const IMG_URL = "https://s.h4ks.com/EDa.png";
const HTTPS_URL = "https://example.com/page";

describe("stripIrcFormatting", () => {
  it("leaves plain text unchanged", () => {
    expect(stripIrcFormatting("hello world")).toBe("hello world");
  });

  it("strips bold", () => {
    expect(stripIrcFormatting(`${BOLD}hello${BOLD}`)).toBe("hello");
  });

  it("strips italic", () => {
    expect(stripIrcFormatting(`${ITALIC}hello${ITALIC}`)).toBe("hello");
  });

  it("strips underline", () => {
    expect(stripIrcFormatting(`${UNDERLINE}hello${UNDERLINE}`)).toBe("hello");
  });

  it("strips strikethrough", () => {
    expect(stripIrcFormatting(`${STRIKETHROUGH}hello${STRIKETHROUGH}`)).toBe(
      "hello",
    );
  });

  it("strips color with 2-digit code", () => {
    expect(stripIrcFormatting(`${COLOR}04red${COLOR}`)).toBe("red");
  });

  it("strips color with 1-digit code", () => {
    expect(stripIrcFormatting(`${COLOR}4red${COLOR}`)).toBe("red");
  });

  it("strips color with foreground+background", () => {
    expect(stripIrcFormatting(`${COLOR}04,05red${COLOR}`)).toBe("red");
  });

  it("strips bare color reset (no digits)", () => {
    expect(stripIrcFormatting(`${COLOR}red${COLOR}`)).toBe("red");
  });

  it("strips reset code", () => {
    expect(stripIrcFormatting(`hello${RESET}world`)).toBe("helloworld");
  });

  it("strips combined color + underline", () => {
    expect(
      stripIrcFormatting(`${COLOR}04${UNDERLINE}hello${UNDERLINE}${RESET}`),
    ).toBe("hello");
  });

  it("strips combined color + bold + strikethrough", () => {
    expect(
      stripIrcFormatting(
        `${COLOR}04${BOLD}${STRIKETHROUGH}hello${STRIKETHROUGH}${BOLD}${RESET}`,
      ),
    ).toBe("hello");
  });
});

describe("extractUrlFromContent (LinkPreview logic)", () => {
  it("finds plain URL", () => {
    expect(extractUrlFromContent(HTTPS_URL)).toBe(HTTPS_URL);
  });

  it("finds URL wrapped in bold IRC code", () => {
    expect(extractUrlFromContent(`${BOLD}${HTTPS_URL}${BOLD}`)).toBe(HTTPS_URL);
  });

  it("finds URL wrapped in italic IRC code", () => {
    expect(extractUrlFromContent(`${ITALIC}${HTTPS_URL}${ITALIC}`)).toBe(
      HTTPS_URL,
    );
  });

  it("finds URL wrapped in underline IRC code", () => {
    expect(extractUrlFromContent(`${UNDERLINE}${HTTPS_URL}${UNDERLINE}`)).toBe(
      HTTPS_URL,
    );
  });

  it("finds URL wrapped in strikethrough IRC code", () => {
    expect(
      extractUrlFromContent(`${STRIKETHROUGH}${HTTPS_URL}${STRIKETHROUGH}`),
    ).toBe(HTTPS_URL);
  });

  it("finds URL wrapped in color code", () => {
    expect(extractUrlFromContent(`${COLOR}04${HTTPS_URL}${COLOR}`)).toBe(
      HTTPS_URL,
    );
  });

  it("finds URL wrapped in color with background", () => {
    expect(extractUrlFromContent(`${COLOR}04,05${HTTPS_URL}${COLOR}`)).toBe(
      HTTPS_URL,
    );
  });

  it("finds URL wrapped in color + underline combined", () => {
    expect(
      extractUrlFromContent(
        `${COLOR}04${UNDERLINE}${HTTPS_URL}${UNDERLINE}${RESET}`,
      ),
    ).toBe(HTTPS_URL);
  });

  it("finds URL wrapped in color + strikethrough combined", () => {
    expect(
      extractUrlFromContent(
        `${COLOR}04${STRIKETHROUGH}${HTTPS_URL}${STRIKETHROUGH}${RESET}`,
      ),
    ).toBe(HTTPS_URL);
  });

  it("finds URL with all formatting combined", () => {
    const raw = `${COLOR}04,05${BOLD}${UNDERLINE}${STRIKETHROUGH}${HTTPS_URL}${STRIKETHROUGH}${UNDERLINE}${BOLD}${RESET}`;
    expect(extractUrlFromContent(raw)).toBe(HTTPS_URL);
  });

  it("finds URL in a sentence with surrounding formatting", () => {
    const raw = `check this ${COLOR}04${HTTPS_URL}${RESET} cool`;
    expect(extractUrlFromContent(raw)).toBe(HTTPS_URL);
  });

  it("finds URL from markdown bold wrapping", () => {
    expect(extractUrlFromContent(`**${HTTPS_URL}**`)).toBe(HTTPS_URL);
  });

  it("returns undefined when no URL present", () => {
    expect(extractUrlFromContent("just some text")).toBeUndefined();
  });
});

describe("isExternalImageUrl (MessageItem logic)", () => {
  it("detects plain image URL", () => {
    expect(isExternalImageUrl(IMG_URL)).toBe(true);
  });

  it("detects image URL wrapped in underline IRC code", () => {
    expect(isExternalImageUrl(`${UNDERLINE}${IMG_URL}${UNDERLINE}`)).toBe(true);
  });

  it("detects image URL wrapped in strikethrough IRC code", () => {
    expect(
      isExternalImageUrl(`${STRIKETHROUGH}${IMG_URL}${STRIKETHROUGH}`),
    ).toBe(true);
  });

  it("detects image URL wrapped in bold IRC code", () => {
    expect(isExternalImageUrl(`${BOLD}${IMG_URL}${BOLD}`)).toBe(true);
  });

  it("detects image URL wrapped in color code", () => {
    expect(isExternalImageUrl(`${COLOR}04${IMG_URL}${RESET}`)).toBe(true);
  });

  it("detects image URL with color + underline combined", () => {
    expect(
      isExternalImageUrl(
        `${COLOR}04${UNDERLINE}${IMG_URL}${UNDERLINE}${RESET}`,
      ),
    ).toBe(true);
  });

  it("detects image URL with color + strikethrough combined", () => {
    expect(
      isExternalImageUrl(
        `${COLOR}04${STRIKETHROUGH}${IMG_URL}${STRIKETHROUGH}${RESET}`,
      ),
    ).toBe(true);
  });

  it("detects image URL with all codes combined", () => {
    const raw = `${COLOR}04,05${BOLD}${UNDERLINE}${STRIKETHROUGH}${IMG_URL}${STRIKETHROUGH}${UNDERLINE}${BOLD}${RESET}`;
    expect(isExternalImageUrl(raw)).toBe(true);
  });

  it("returns false for non-image URL", () => {
    expect(isExternalImageUrl(HTTPS_URL)).toBe(false);
  });

  it("returns false when message has surrounding text (not just the URL)", () => {
    expect(isExternalImageUrl(`look at this ${IMG_URL}`)).toBe(false);
  });
});

// Simulates what MessageItem passes to ImageWithFallback:
// isExternalImageUrl detection uses strippedContent, but the url prop was
// previously message.content (raw). This suite ensures strippedContent IS the
// clean URL — catching the bug where detection passed but image loading failed.
describe("strippedContent as image src (ImageWithFallback url prop)", () => {
  const cases: Array<[string, string]> = [
    ["plain", IMG_URL],
    ["bold", `${BOLD}${IMG_URL}${BOLD}`],
    ["underline", `${UNDERLINE}${IMG_URL}${UNDERLINE}`],
    ["strikethrough", `${STRIKETHROUGH}${IMG_URL}${STRIKETHROUGH}`],
    ["color", `${COLOR}04${IMG_URL}${RESET}`],
    ["color+bold", `${COLOR}04${BOLD}${IMG_URL}${BOLD}${RESET}`],
    ["color+underline", `${COLOR}04${UNDERLINE}${IMG_URL}${UNDERLINE}${RESET}`],
    [
      "color+strikethrough",
      `${COLOR}04${STRIKETHROUGH}${IMG_URL}${STRIKETHROUGH}${RESET}`,
    ],
    [
      "color+bold+underline",
      `${COLOR}04${BOLD}${UNDERLINE}${IMG_URL}${UNDERLINE}${BOLD}${RESET}`,
    ],
    [
      "all combined",
      `${COLOR}04,05${BOLD}${UNDERLINE}${STRIKETHROUGH}${IMG_URL}${STRIKETHROUGH}${UNDERLINE}${BOLD}${RESET}`,
    ],
  ];

  for (const [label, raw] of cases) {
    it(`stripped src is clean URL for: ${label}`, () => {
      expect(stripIrcFormatting(raw)).toBe(IMG_URL);
    });
  }
});

describe("extractEmbeddedUrls (embeddedFilehostImages logic)", () => {
  it("extracts plain URL from text", () => {
    expect(extractEmbeddedUrls(`some text ${IMG_URL} more text`)).toContain(
      IMG_URL,
    );
  });

  it("extracts URL when wrapped in underline", () => {
    expect(
      extractEmbeddedUrls(`text ${UNDERLINE}${IMG_URL}${UNDERLINE} more`),
    ).toContain(IMG_URL);
  });

  it("extracts URL when wrapped in strikethrough", () => {
    expect(
      extractEmbeddedUrls(
        `text ${STRIKETHROUGH}${IMG_URL}${STRIKETHROUGH} more`,
      ),
    ).toContain(IMG_URL);
  });

  it("extracts URL when wrapped in color + strikethrough", () => {
    expect(
      extractEmbeddedUrls(
        `text ${COLOR}04${STRIKETHROUGH}${IMG_URL}${STRIKETHROUGH}${RESET} more`,
      ),
    ).toContain(IMG_URL);
  });

  it("extracts URL when wrapped in color + underline", () => {
    expect(
      extractEmbeddedUrls(
        `text ${COLOR}04${UNDERLINE}${IMG_URL}${UNDERLINE}${RESET} more`,
      ),
    ).toContain(IMG_URL);
  });

  it("extracts clean URL without trailing IRC bytes", () => {
    const urls = extractEmbeddedUrls(`${UNDERLINE}${IMG_URL}${UNDERLINE}`);
    expect(urls[0]).toBe(IMG_URL);
  });

  it("extracts multiple URLs from one message", () => {
    const raw = `${COLOR}04${IMG_URL}${RESET} and ${UNDERLINE}${HTTPS_URL}${UNDERLINE}`;
    const urls = extractEmbeddedUrls(raw);
    expect(urls).toContain(IMG_URL);
    expect(urls).toContain(HTTPS_URL);
  });
});
