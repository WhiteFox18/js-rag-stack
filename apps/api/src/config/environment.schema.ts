import { z } from 'zod';

const booleanFromEnvironment = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    DATABASE_URL: z
      .string()
      .min(1)
      .default(
        'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
      ),
    REDIS_URL: z.url().default('redis://localhost:6379'),
    REDIS_CHAT_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
    REDIS_LOCK_TTL_MS: z.coerce.number().int().positive().default(30_000),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),
    ANONYMOUS_SESSION_TTL: z
      .string()
      .regex(/^\d+[dhm]$/)
      .default('30d'),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32)
      .default('test-access-secret-at-least-32-bytes'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32)
      .default('test-refresh-secret-at-least-32-bytes'),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^\d+[dhm]$/)
      .default('1d'),
    JWT_REFRESH_TTL: z
      .string()
      .regex(/^\d+[dhm]$/)
      .default('7d'),
    CSRF_SECRET: z
      .string()
      .min(32)
      .default('test-csrf-secret-at-least-32-bytes'),
    COOKIE_SECURE: booleanFromEnvironment,
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z
      .string()
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== 'production') {
      return;
    }

    for (const key of [
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'CSRF_SECRET',
    ] as const) {
      if (
        environment[key].startsWith('test-') ||
        environment[key].startsWith('replace-')
      ) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be replaced in production`,
        });
      }
    }
  });

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  environment: Record<string, unknown>,
): AppEnvironment {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}
