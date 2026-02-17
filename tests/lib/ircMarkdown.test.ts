import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { processMarkdownInText, renderMarkdown } from "../../src/lib/ircUtils";

function html(node: React.ReactNode): string {
  return renderToStaticMarkup(node as React.ReactElement);
}

describe("renderMarkdown", () => {
  it("renders a fenced code block", () => {
    const input = "hello\n```py\na=10\nprint(a)\n```\nend";
    const out = html(renderMarkdown(input));
    expect(out).toContain("<pre><code");
    expect(out).toContain("language-py");
    expect(out).not.toContain("```");
  });

  it("renders inline code", () => {
    const out = html(renderMarkdown("use `foo()` here"));
    expect(out).toContain("<code");
    expect(out).toContain("foo()");
  });

  it("renders bold and italic", () => {
    const out = html(renderMarkdown("**bold** and *italic*"));
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
  });
});

describe("renderMarkdown with IRC colors", () => {
  it("strips IRC colors from fenced code blocks", () => {
    const input = "hello\n```py\n\x0304a=10\nprint(a)\n```\nend";
    const out = html(renderMarkdown(input));
    expect(out).toContain("<pre><code");
    expect(out).toContain("language-py");
    expect(out).not.toContain("\x03");
    // Color number should not appear as literal text before the variable
    expect(out).not.toMatch(/04a/);
  });

  it("applies color spans to prose, not code blocks", () => {
    const input = "\x0308hello\n```py\na=10\n```\nend";
    const out = html(renderMarkdown(input));
    // Prose should be colored
    expect(out).toContain("color:#FFFF00");
    expect(out).toContain("hello");
    // Code block should render properly (content may be syntax-highlighted)
    expect(out).toContain("<pre><code");
    expect(out).toContain("language-py");
    // Color spans should NOT be inside the code block
    expect(out).not.toMatch(/<code[^>]*>.*color:#FFFF00.*<\/code>/s);
  });

  it("colorizes text after a code block", () => {
    const input = "before\n```\ncode\n```\n\x0308after";
    const out = html(renderMarkdown(input));
    expect(out).toContain("<pre>");
    expect(out).toContain("color:#FFFF00");
    expect(out).toContain("after");
  });

  it("strips IRC colors from inline code", () => {
    const input = "use `\x0304foo()` here";
    const out = html(renderMarkdown(input));
    expect(out).toContain("<code");
    expect(out).toContain("foo()");
    expect(out).not.toContain("\x03");
  });

  it("handles color + bold markdown together", () => {
    const input = "\x0307**orange bold**";
    const out = html(renderMarkdown(input));
    expect(out).toContain("<strong>");
    expect(out).toContain("orange bold");
    expect(out).toContain("color:#FC7F00");
  });

  it("does not show raw span HTML as text", () => {
    const input = "text\n```py\na=10\n```\n\x0308end";
    const out = html(renderMarkdown(input));
    // The span should be actual HTML, not escaped text
    expect(out).not.toContain("&lt;span");
    expect(out).not.toContain('<span style="color:#FFFF00">end&lt;/span');
  });
});

describe("renderMarkdown edge cases", () => {
  it("handles color wrapping entire message including code block", () => {
    // User sends colored message with code block inside
    const input =
      "\x0308this is\n```py\na=10\nfor i in range(a):\nprint(i)\n```\nend";
    const out = html(renderMarkdown(input));
    expect(out).toContain("<pre><code");
    expect(out).not.toContain("```");
    // end should be colored, not raw escape codes
    expect(out).not.toContain("\x03");
  });

  it("handles color code right before code fence", () => {
    const input = "text\n\x0308```py\na=10\n```\nend";
    const out = html(renderMarkdown(input));
    expect(out).toContain("<pre><code");
  });

  it("handles color code inside code fence line", () => {
    const input = "text\n```\x0308py\na=10\n```\nend";
    const out = html(renderMarkdown(input));
    // Should still render as code block
    expect(out).toContain("<pre><code");
  });

  it("handles multiple code blocks with colors between them", () => {
    const input = "```\nfirst\n```\n\x0304red text\n```\nsecond\n```";
    const out = html(renderMarkdown(input));
    const preCount = (out.match(/<pre>/g) || []).length;
    expect(preCount).toBe(2);
    expect(out).toContain("color:#FF0000");
  });

  it("handles unclosed color spanning across code block", () => {
    // Color set before code block, continues after
    const input = "\x0308before\n```\ncode\n```\nafter";
    const out = html(renderMarkdown(input));
    expect(out).toContain("<pre><code");
    expect(out).not.toContain("\x03");
  });
});

describe("processMarkdownInText", () => {
  it("uses markdown path when markdown patterns detected and enabled", () => {
    const out = html(
      processMarkdownInText("**bold** text", true, true) as React.ReactElement,
    );
    expect(out).toContain("<strong>bold</strong>");
  });

  it("uses IRC path when no markdown detected", () => {
    const out = html(
      processMarkdownInText("plain text", true, false) as React.ReactElement,
    );
    expect(out).not.toContain("<strong>");
  });

  it("handles IRC colors + markdown code block", () => {
    const input = "\x0308colored\n```\ncode block\n```\nend";
    const out = html(
      processMarkdownInText(input, true, true) as React.ReactElement,
    );
    expect(out).toContain("<pre><code");
    expect(out).toContain("block");
    expect(out).toContain("color:#FFFF00");
  });
});
