import { z } from 'zod';

const booleanFromEnvironment = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z.object({
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
  COOKIE_SECURE: booleanFromEnvironment,
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((value) => value || undefined),
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
