export interface SetWithTtlParams {
  key: string;
  value: string;
  ttlSeconds: number;
}

export interface SetIfAbsentParams {
  key: string;
  value: string;
  ttlMs: number;
}

export interface MatchValueParams {
  key: string;
  value: string;
}

export interface ExtendIfValueMatchesParams extends MatchValueParams {
  ttlMs: number;
}
