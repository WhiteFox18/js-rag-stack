const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

/**
 * Loads shiki on first use so it stays out of the initial bundle. Any failure
 * (unknown language, chunk load error) yields null and the caller keeps plain
 * code.
 */
export async function highlightCode({
  code,
  lang,
}: {
  code: string;
  lang: string;
}): Promise<string | null> {
  try {
    const { codeToHtml } = await import('shiki');
    return await codeToHtml(code, {
      lang,
      themes: THEMES,
      defaultColor: false,
    });
  } catch {
    return null;
  }
}
