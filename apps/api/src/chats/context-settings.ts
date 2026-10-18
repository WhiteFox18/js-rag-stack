import type { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import type { ContextSettings } from './chats.types';

export function readContextSettings(
  config: ConfigService<AppEnvironment, true>,
): ContextSettings {
  return {
    summarizeAtRatio: config.get('CHAT_CONTEXT_SUMMARIZE_AT_RATIO', {
      infer: true,
    }),
    targetRatio: config.get('CHAT_CONTEXT_TARGET_RATIO', { infer: true }),
    keepRecentMessages: config.get('CHAT_CONTEXT_KEEP_RECENT_MESSAGES', {
      infer: true,
    }),
    charsPerToken: config.get('CHAT_CONTEXT_CHARS_PER_TOKEN', { infer: true }),
    summaryMaxRatio: config.get('CHAT_CONTEXT_SUMMARY_MAX_RATIO', {
      infer: true,
    }),
  };
}
