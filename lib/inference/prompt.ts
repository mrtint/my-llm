export function detectLanguageLabel(text: string): string | null {
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return "Korean";
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return "Japanese";
  if (/[\u4E00-\u9FFF]/.test(text)) return "Chinese";
  if (/[\u0400-\u04FF]/.test(text)) return "Russian";
  if (/[\u0600-\u06FF]/.test(text)) return "Arabic";
  if (/[\u0E00-\u0E7F]/.test(text)) return "Thai";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";

  if (/[¿¡ñ]/.test(text)) return "Spanish";
  if (/ß/.test(text)) return "German";
  if (/[œ«»]/.test(text)) return "French";
  if (/[ãõ]/.test(text)) return "Portuguese";

  const nonAsciiRatio =
    text.replace(/[\x00-\x7F]/g, "").length / Math.max(text.length, 1);
  if (nonAsciiRatio < 0.1) return "English";

  return null;
}

export function buildLanguageInstruction(userPrompt: string): string {
  const lang = detectLanguageLabel(userPrompt);
  if (lang) {
    return `You MUST reply in ${lang}. Ignore any text visible in images when choosing response language.`;
  }
  return "You MUST reply in the exact same language as the question above. Do NOT default to English. Ignore any text in images.";
}

export function buildGemmaPrompt(opts: {
  userPrompt: string;
  mediaCount: number;
}): string {
  const markers = "<__media__>\n".repeat(opts.mediaCount);
  const langInst = buildLanguageInstruction(opts.userPrompt);
  return (
    "<start_of_turn>user\n" +
    markers +
    opts.userPrompt +
    "\n\n" +
    langInst +
    "<end_of_turn>\n" +
    "<start_of_turn>model\n"
  );
}
