import { validateEnvironment } from '../src/config/environment.schema';

describe('validateEnvironment', () => {
  it('coerces valid configuration values', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'test',
        API_PORT: '3100',
        WEB_ORIGIN: 'http://localhost:5173',
        COOKIE_SECURE: 'true',
      }),
    ).toEqual(
      expect.objectContaining({
        NODE_ENV: 'test',
        API_PORT: 3100,
        WEB_ORIGIN: 'http://localhost:5173',
        COOKIE_SECURE: true,
        REDIS_CHAT_TTL_SECONDS: 86_400,
        CHAT_MAX_MESSAGE_CHARS: 12_000,
      }),
    );
  });

  it('rejects an invalid web origin', () => {
    expect(() => validateEnvironment({ WEB_ORIGIN: 'not-a-url' })).toThrow(
      'Invalid environment',
    );
  });

  it('rejects placeholder security secrets in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-bytes',
        JWT_REFRESH_SECRET: 'replace-with-a-different-32-byte-secret',
        CSRF_SECRET: 'replace-with-at-least-32-random-bytes',
      }),
    ).toThrow('must be replaced in production');
  });

  it('provides context window defaults and rejects an inverted target', () => {
    expect(validateEnvironment({})).toEqual(
      expect.objectContaining({
        CHAT_CONTEXT_SUMMARIZE_AT_RATIO: 0.75,
        CHAT_CONTEXT_TARGET_RATIO: 0.4,
        CHAT_CONTEXT_KEEP_RECENT_MESSAGES: 4,
        CHAT_CONTEXT_CHARS_PER_TOKEN: 3,
        CHAT_CONTEXT_SUMMARY_MAX_RATIO: 0.1,
      }),
    );
    expect(() =>
      validateEnvironment({
        CHAT_CONTEXT_SUMMARIZE_AT_RATIO: '0.5',
        CHAT_CONTEXT_TARGET_RATIO: '0.6',
      }),
    ).toThrow('CHAT_CONTEXT_TARGET_RATIO must be lower');
  });
});
