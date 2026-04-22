export type NativeTranslatorAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export type BrowserTranslationAvailability =
  | NativeTranslatorAvailability
  | "unsupported"
  | "insecure-context";

export interface TranslationLanguagePair {
  sourceLanguage: string;
  targetLanguage: string;
}

export interface BrowserTranslationRequest extends TranslationLanguagePair {
  text: string;
  signal?: AbortSignal;
  onDownloadProgress?: (progress: number) => void;
}

export interface BrowserLanguageDetectionRequest {
  text: string;
  signal?: AbortSignal;
  onDownloadProgress?: (progress: number) => void;
}

interface CreateMonitorLike {
  addEventListener(
    type: "downloadprogress",
    listener: (event: Event) => void,
  ): void;
}

interface BrowserLanguageDetectionResult {
  detectedLanguage?: string;
}

interface BrowserLanguageDetectorInstance {
  detect(input: string): Promise<BrowserLanguageDetectionResult[]>;
  destroy(): void;
}

interface BrowserLanguageDetectorStatic {
  create(options?: {
    signal?: AbortSignal;
    monitor?: (monitor: CreateMonitorLike) => void;
  }): Promise<BrowserLanguageDetectorInstance>;
}

interface BrowserTranslatorInstance {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface BrowserTranslatorStatic {
  availability(
    options: TranslationLanguagePair,
  ): Promise<NativeTranslatorAvailability | null>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    signal?: AbortSignal;
    monitor?: (monitor: CreateMonitorLike) => void;
  }): Promise<BrowserTranslatorInstance>;
}

function getLanguageDetectorApi(): BrowserLanguageDetectorStatic | null {
  const maybeLanguageDetector = (
    globalThis as typeof globalThis & {
      LanguageDetector?: BrowserLanguageDetectorStatic;
    }
  ).LanguageDetector;
  return maybeLanguageDetector ?? null;
}

function getTranslatorApi(): BrowserTranslatorStatic | null {
  const maybeTranslator = (
    globalThis as typeof globalThis & {
      Translator?: BrowserTranslatorStatic;
    }
  ).Translator;
  return maybeTranslator ?? null;
}

/**
 * Canonicalizes a BCP 47 language tag without discarding script or region subtags.
 */
export function normalizeTranslationLanguageTag(
  language: string | null | undefined,
): string | null {
  const trimmed = language?.trim();
  if (!trimmed) return null;

  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves the preferred target language, falling back to the browser locale.
 */
export function getPreferredTranslationTargetLanguage(): string {
  return getPreferredTranslationTargetLanguageFromSetting();
}

/**
 * Resolves the preferred target language using an explicit setting when present.
 */
export function getPreferredTranslationTargetLanguageFromSetting(
  explicitLanguage?: string | null,
): string {
  const explicit = normalizeTranslationLanguageTag(explicitLanguage);
  if (explicit) return explicit;

  const languages =
    typeof navigator === "undefined"
      ? []
      : [navigator.language, ...(navigator.languages ?? [])];

  for (const language of languages) {
    const normalized = normalizeTranslationLanguageTag(language);
    if (normalized) return normalized;
  }

  return "en";
}

/**
 * Reads the source language from IRC message metadata when one is available.
 */
export function getMessageSourceLanguage(
  tags?: Record<string, string>,
): string | null {
  return normalizeTranslationLanguageTag(
    tags?.["+draft/language"] ??
      tags?.["draft/language"] ??
      tags?.["+language"] ??
      tags?.language,
  );
}

export function canUseBrowserTranslation(): boolean {
  return window.isSecureContext && getTranslatorApi() !== null;
}

/**
 * Detects the source language for untagged messages using the browser detector API.
 */
export async function detectMessageSourceLanguage({
  text,
  signal,
  onDownloadProgress,
}: BrowserLanguageDetectionRequest): Promise<string | null> {
  if (!window.isSecureContext) return null;

  const languageDetectorApi = getLanguageDetectorApi();
  if (!languageDetectorApi) return null;

  try {
    const detector = await languageDetectorApi.create({
      signal,
      monitor: onDownloadProgress
        ? (monitor) => {
            monitor.addEventListener("downloadprogress", (event) => {
              onDownloadProgress((event as ProgressEvent).loaded);
            });
          }
        : undefined,
    });

    try {
      const results = await detector.detect(text);
      return normalizeTranslationLanguageTag(results[0]?.detectedLanguage);
    } finally {
      detector.destroy();
    }
  } catch {
    return null;
  }
}

/**
 * Checks whether the runtime supports a requested translation pair.
 */
export async function getBrowserTranslationAvailability({
  sourceLanguage,
  targetLanguage,
}: TranslationLanguagePair): Promise<BrowserTranslationAvailability> {
  if (!window.isSecureContext) return "insecure-context";

  const translatorApi = getTranslatorApi();
  if (!translatorApi) return "unsupported";

  if (sourceLanguage === targetLanguage) return "unavailable";

  try {
    return (
      (await translatorApi.availability({
        sourceLanguage,
        targetLanguage,
      })) ?? "unavailable"
    );
  } catch {
    return "unavailable";
  }
}

/**
 * Creates a translator, runs a translation, and disposes the translator instance.
 */
export async function translateWithBrowser({
  sourceLanguage,
  targetLanguage,
  text,
  signal,
  onDownloadProgress,
}: BrowserTranslationRequest): Promise<string> {
  if (!window.isSecureContext) {
    throw new Error("Browser translation requires a secure context.");
  }

  const translatorApi = getTranslatorApi();
  if (!translatorApi) {
    throw new Error("Browser translation is not supported in this runtime.");
  }

  const translator = await translatorApi.create({
    sourceLanguage,
    targetLanguage,
    signal,
    monitor: onDownloadProgress
      ? (monitor) => {
          monitor.addEventListener("downloadprogress", (event) => {
            onDownloadProgress((event as ProgressEvent).loaded);
          });
        }
      : undefined,
  });

  try {
    return await translator.translate(text, { signal });
  } finally {
    translator.destroy();
  }
}
