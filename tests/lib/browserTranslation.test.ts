import { afterEach, describe, expect, test, vi } from "vitest";
import {
  canUseBrowserTranslation,
  getBrowserTranslationAvailability,
  getMessageSourceLanguage,
  getPreferredTranslationTargetLanguage,
  getPreferredTranslationTargetLanguageFromSetting,
  normalizeTranslationLanguageTag,
  translateWithBrowser,
} from "../../src/lib/browserTranslation";

function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setSecureContext(true);
});

describe("browserTranslation", () => {
  test("normalizes translation language tags to primary subtags", () => {
    expect(normalizeTranslationLanguageTag("en-US")).toBe("en");
    expect(normalizeTranslationLanguageTag(" ES ")).toBe("es");
    expect(normalizeTranslationLanguageTag(undefined)).toBeNull();
  });

  test("derives preferred target language from navigator", () => {
    Object.defineProperty(window, "navigator", {
      configurable: true,
      value: {
        language: "pt-BR",
        languages: ["pt-BR", "en-US"],
      },
    });

    expect(getPreferredTranslationTargetLanguage()).toBe("pt");
  });

  test("prefers an explicit target language setting over navigator", () => {
    Object.defineProperty(window, "navigator", {
      configurable: true,
      value: {
        language: "pt-BR",
        languages: ["pt-BR", "en-US"],
      },
    });

    expect(getPreferredTranslationTargetLanguageFromSetting("es-MX")).toBe(
      "es",
    );
  });

  test("derives source language from message tags with english fallback", () => {
    expect(
      getMessageSourceLanguage({
        "+draft/language": "fr-CA",
      }),
    ).toBe("fr");
    expect(getMessageSourceLanguage()).toBe("en");
  });

  test("reports unsupported when Translator is missing", async () => {
    setSecureContext(true);

    expect(canUseBrowserTranslation()).toBe(false);
    await expect(
      getBrowserTranslationAvailability({
        sourceLanguage: "en",
        targetLanguage: "es",
      }),
    ).resolves.toBe("unsupported");
  });

  test("reports insecure-context before touching Translator", async () => {
    const availability = vi.fn();
    setSecureContext(false);
    vi.stubGlobal("Translator", { availability, create: vi.fn() });

    expect(canUseBrowserTranslation()).toBe(false);
    await expect(
      getBrowserTranslationAvailability({
        sourceLanguage: "en",
        targetLanguage: "es",
      }),
    ).resolves.toBe("insecure-context");
    expect(availability).not.toHaveBeenCalled();
  });

  test("maps native availability values", async () => {
    setSecureContext(true);
    vi.stubGlobal("Translator", {
      availability: vi.fn().mockResolvedValue("downloadable"),
      create: vi.fn(),
    });

    await expect(
      getBrowserTranslationAvailability({
        sourceLanguage: "en",
        targetLanguage: "es",
      }),
    ).resolves.toBe("downloadable");
  });

  test("returns unavailable for same-language requests", async () => {
    const availability = vi.fn();
    setSecureContext(true);
    vi.stubGlobal("Translator", {
      availability,
      create: vi.fn(),
    });

    await expect(
      getBrowserTranslationAvailability({
        sourceLanguage: "en",
        targetLanguage: "en",
      }),
    ).resolves.toBe("unavailable");
    expect(availability).not.toHaveBeenCalled();
  });

  test("creates, translates, reports progress, and destroys", async () => {
    const addEventListener = vi.fn(
      (
        _event: string,
        listener: (event: Pick<ProgressEvent, "loaded">) => void,
      ) => {
        listener({ loaded: 0.5 });
      },
    );
    const destroy = vi.fn();
    const translate = vi.fn().mockResolvedValue("hola");
    const create = vi.fn().mockResolvedValue({ translate, destroy });
    const progress = vi.fn();

    setSecureContext(true);
    vi.stubGlobal("Translator", {
      availability: vi.fn(),
      create,
    });

    await expect(
      translateWithBrowser({
        sourceLanguage: "en",
        targetLanguage: "es",
        text: "hello",
        onDownloadProgress: progress,
      }),
    ).resolves.toBe("hola");

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: "en",
        targetLanguage: "es",
        monitor: expect.any(Function),
      }),
    );

    const [{ monitor }] = create.mock.calls[0];
    monitor({ addEventListener } as unknown as EventTarget);

    expect(addEventListener).toHaveBeenCalledWith(
      "downloadprogress",
      expect.any(Function),
    );
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(translate).toHaveBeenCalledWith("hello", { signal: undefined });
    expect(destroy).toHaveBeenCalledOnce();
  });

  test("still destroys the translator when translation fails", async () => {
    const destroy = vi.fn();
    const translate = vi.fn().mockRejectedValue(new Error("boom"));

    setSecureContext(true);
    vi.stubGlobal("Translator", {
      availability: vi.fn(),
      create: vi.fn().mockResolvedValue({ translate, destroy }),
    });

    await expect(
      translateWithBrowser({
        sourceLanguage: "en",
        targetLanguage: "es",
        text: "hello",
      }),
    ).rejects.toThrow("boom");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
