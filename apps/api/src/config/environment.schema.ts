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
    OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
    OLLAMA_ALLOWED_MODELS: z
      .string()
      .min(1)
      .default('qwen2.5:1.5b')
      .transform((value) =>
        value
          .split(',')
          .map((model) => model.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().min(1)).min(1)),
    OLLAMA_DEFAULT_MODEL: z.string().min(1).default('qwen2.5:1.5b'),
    OLLAMA_CONNECT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(5_000),
    OLLAMA_FIRST_TOKEN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
    OLLAMA_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    OLLAMA_TOTAL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(300_000),
    CHAT_MAX_MESSAGE_CHARS: z.coerce.number().int().positive().default(12_000),
    CHAT_MAX_HISTORY_MESSAGES: z.coerce.number().int().positive().default(100),
    CHAT_MAX_HISTORY_CHARS: z.coerce.number().int().positive().default(100_000),
    CHAT_MAX_RESPONSE_CHARS: z.coerce
      .number()
      .int()
      .positive()
      .default(100_000),
    CHAT_MAX_CONCURRENT_GENERATIONS_PER_PRINCIPAL: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(1),
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
    if (
      !environment.OLLAMA_ALLOWED_MODELS.includes(
        environment.OLLAMA_DEFAULT_MODEL,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OLLAMA_DEFAULT_MODEL'],
        message:
          'OLLAMA_DEFAULT_MODEL must be included in OLLAMA_ALLOWED_MODELS',
      });
    }

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
