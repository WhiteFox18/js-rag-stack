import type { ChatStreamEvent } from '@js-rag-stack/contracts';

export function encodeSseEvent(event: ChatStreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function encodeSseHeartbeat(): string {
  return ': heartbeat\n\n';
}
