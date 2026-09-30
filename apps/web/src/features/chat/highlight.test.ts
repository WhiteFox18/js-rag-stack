// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { highlightCode } from './highlight';

describe('highlightCode', () => {
  it('produces dual-theme shiki markup', async () => {
    const html = await highlightCode({ code: 'const a = 1;', lang: 'ts' });
    expect(html).toContain('class="shiki');
    expect(html).toContain('--shiki-dark');
  }, 20_000);

  it('returns null for unknown languages', async () => {
    expect(
      await highlightCode({ code: 'x', lang: 'not-a-language' }),
    ).toBeNull();
  }, 20_000);
});
