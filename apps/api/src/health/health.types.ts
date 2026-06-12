export interface ReadinessResponse {
  status: 'ready' | 'unavailable';
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}
