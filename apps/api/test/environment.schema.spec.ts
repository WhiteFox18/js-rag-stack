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
      }),
    );
  });

  it('rejects an invalid web origin', () => {
    expect(() => validateEnvironment({ WEB_ORIGIN: 'not-a-url' })).toThrow(
      'Invalid environment',
    );
  });
});
