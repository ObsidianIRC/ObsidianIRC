import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  canUseBrowserTranslation,
  detectMessageSourceLanguage,
  getBrowserTranslationAvailability,
  getMessageSourceLanguage,
  getPreferredTranslationTargetLanguage,
  getPreferredTranslationTargetLanguageFromSetting,
  normalizeTranslationLanguageTag,
  translateWithBrowser,
} from "../../src/lib/browserTranslation";

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "navigator",
);

function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
}

function setNavigatorLanguages(language: string, languages: string[]) {
  Object.defineProperty(window, "navigator", {
    configurable: true,
    value: {
      ...window.navigator,
      language,
      languages,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setSecureContext(true);
  if (originalNavigatorDescriptor) {
    Object.defineProperty(window, "navigator", originalNavigatorDescriptor);
  }
});

beforeEach(() => {
  setSecureContext(true);
});

describe("browserTranslation", () => {
  test("preserves and canonicalizes full BCP 47 language tags", () => {
    expect(normalizeTranslationLanguageTag("en-US")).toBe("en-US");
    expect(normalizeTranslationLanguageTag("zh-hant")).toBe("zh-Hant");
    expect(normalizeTranslationLanguageTag(undefined)).toBeNull();
  });

  test("derives preferred target language from navigator", () => {
    setNavigatorLanguages("pt-BR", ["pt-BR", "en-US"]);

    expect(getPreferredTranslationTargetLanguage()).toBe("pt-BR");
  });

  test("prefers an explicit target language setting over navigator", () => {
    setNavigatorLanguages("pt-BR", ["pt-BR", "en-US"]);

    expect(getPreferredTranslationTargetLanguageFromSetting("es-MX")).toBe(
      "es-MX",
    );
  });

  test("falls back to the browser language when the setting is empty", () => {
    setNavigatorLanguages("pt-BR", ["pt-BR", "en-US"]);

    expect(getPreferredTranslationTargetLanguageFromSetting("")).toBe("pt-BR");
  });

  test("derives source language from message tags without forcing english", () => {
    expect(
      getMessageSourceLanguage({
        "+draft/language": "fr-CA",
      }),
    ).toBe("fr-CA");
    expect(getMessageSourceLanguage()).toBeNull();
  });

  test("detects source language with the browser language detector", async () => {
    const detect = vi
      .fn()
      .mockResolvedValue([{ detectedLanguage: "pt-BR", confidence: 0.91 }]);
    const destroy = vi.fn();

    vi.stubGlobal("LanguageDetector", {
      create: vi.fn().mockResolvedValue({ detect, destroy }),
    });

    await expect(
      detectMessageSourceLanguage({ text: "ola mundo como voce esta hoje" }),
    ).resolves.toBe("pt-BR");
    expect(destroy).toHaveBeenCalledOnce();
  });

  test("returns null for short text because language detection would be unreliable", async () => {
    const detect = vi.fn();

    vi.stubGlobal("LanguageDetector", {
      create: vi.fn().mockResolvedValue({ detect, destroy: vi.fn() }),
    });

    await expect(
      detectMessageSourceLanguage({ text: "hola mundo" }),
    ).resolves.toBe(null);
    expect(detect).not.toHaveBeenCalled();
  });

  test("returns null for low-confidence language detection results", async () => {
    const detect = vi
      .fn()
      .mockResolvedValue([{ detectedLanguage: "pt-BR", confidence: 0.2 }]);
    const destroy = vi.fn();

    vi.stubGlobal("LanguageDetector", {
      create: vi.fn().mockResolvedValue({ detect, destroy }),
    });

    await expect(
      detectMessageSourceLanguage({ text: "ola mundo como voce esta hoje" }),
    ).resolves.toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
  });

  test("returns null for undetermined language detection results", async () => {
    const detect = vi
      .fn()
      .mockResolvedValue([{ detectedLanguage: "und", confidence: 0.99 }]);
    const destroy = vi.fn();

    vi.stubGlobal("LanguageDetector", {
      create: vi.fn().mockResolvedValue({ detect, destroy }),
    });

    await expect(
      detectMessageSourceLanguage({ text: "ola mundo como voce esta hoje" }),
    ).resolves.toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
  });

  test("returns null when language detection is unavailable", async () => {
    await expect(
      detectMessageSourceLanguage({
        text: "hola mundo desde una prueba larga",
      }),
    ).resolves.toBeNull();
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
