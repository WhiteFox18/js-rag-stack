export interface HealthResponse {
  status: 'ok';
  service: 'api';
  timestamp: string;
  uptimeSeconds: number;
}

export type StreamEventName =
  | 'stream.started'
  | 'message.delta'
  | 'message.completed'
  | 'stream.error'
  | 'stream.cancelled'
  | 'heartbeat';
