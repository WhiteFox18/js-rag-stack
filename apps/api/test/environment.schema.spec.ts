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
        OLLAMA_ALLOWED_MODELS: ['qwen2.5:1.5b'],
        CHAT_MAX_MESSAGE_CHARS: 12_000,
      }),
    );
  });

  it('requires the default Ollama model to be allowed', () => {
    expect(() =>
      validateEnvironment({
        OLLAMA_ALLOWED_MODELS: 'llama3.2:1b',
        OLLAMA_DEFAULT_MODEL: 'qwen2.5:1.5b',
      }),
    ).toThrow('OLLAMA_DEFAULT_MODEL must be included');
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
});
