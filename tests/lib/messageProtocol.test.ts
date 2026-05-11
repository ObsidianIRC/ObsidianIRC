import { describe, expect, test } from "vitest";
import { createBatchId, splitLongMessage } from "../../src/lib/messageProtocol";

const utf8Encoder = new TextEncoder();

describe("messageProtocol", () => {
  test("creates batch IDs with only ASCII letters, numbers, and hyphen", () => {
    const batchId = createBatchId();

    expect(batchId).not.toContain("_");
    expect(batchId).toMatch(/^[A-Za-z0-9-]+$/);
  });

  test("preserves trailing whitespace on the final split chunk", () => {
    const lines = splitLongMessage("hello world again ", "x".repeat(370));

    expect(lines.at(-1)).toBe("again ");
  });

  test("does not trim existing whitespace before pushing an earlier chunk", () => {
    const lines = splitLongMessage("hello   again final", "x".repeat(371));

    expect(lines[0]).toBe("hello  ");
  });

  test("splits multiline payloads using UTF-8 byte length without breaking emoji code points", () => {
    const lines = splitLongMessage("🙂🙂🙂🙂", "x".repeat(370));

    expect(lines).toEqual(["🙂🙂🙂", "🙂"]);
    expect(lines.join("")).toBe("🙂🙂🙂🙂");
    expect(lines.every((line) => utf8Encoder.encode(line).length <= 13)).toBe(
      true,
    );
  });
});
