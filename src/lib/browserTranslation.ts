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

export function normalizeTranslationLanguageTag(
  language: string | null | undefined,
): string | null {
  const trimmed = language?.trim();
  if (!trimmed) return null;

  const [primarySubtag] = trimmed.split("-");
  const normalized = primarySubtag?.toLowerCase();
  return normalized || null;
}

export function getPreferredTranslationTargetLanguage(): string {
  return getPreferredTranslationTargetLanguageFromSetting();
}

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

export function getMessageSourceLanguage(
  tags?: Record<string, string>,
): string {
  return (
    normalizeTranslationLanguageTag(
      tags?.["+draft/language"] ??
        tags?.["draft/language"] ??
        tags?.["+language"] ??
        tags?.language,
    ) ?? "en"
  );
}

interface CreateMonitorLike {
  addEventListener(
    type: "downloadprogress",
    listener: (event: Event) => void,
  ): void;
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

function getTranslatorApi(): BrowserTranslatorStatic | null {
  const maybeTranslator = (
    globalThis as typeof globalThis & {
      Translator?: BrowserTranslatorStatic;
    }
  ).Translator;
  return maybeTranslator ?? null;
}

export function canUseBrowserTranslation(): boolean {
  return window.isSecureContext && getTranslatorApi() !== null;
}

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
