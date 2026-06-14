export interface ReadinessResponse {
  status: 'ready' | 'degraded' | 'unavailable';
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    ollama: 'up' | 'down';
  };
}
