// Keep the default model in one place so the batch generator and the original
// single-story spike cannot silently drift onto different Gemini versions.
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}
