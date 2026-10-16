/**
 * Provider-agnostic translation interface. Mock adapter below just marks the
 * text as "translated" for development — swap for Google Cloud Translation
 * (or similar) in production by implementing the same signature.
 */
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!process.env.TRANSLATION_PROVIDER || process.env.TRANSLATION_PROVIDER === 'mock') {
    return `[translated to ${targetLanguage}] ${text}`;
  }
  throw new Error(`Translation provider "${process.env.TRANSLATION_PROVIDER}" not implemented yet.`);
}
