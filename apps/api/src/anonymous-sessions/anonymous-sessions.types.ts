import type { Request, Response } from 'express';

export interface CreateAnonymousSessionParams {
  tokenHash: string;
  expiresAt: Date;
}

export interface FindActiveAnonymousSessionParams {
  tokenHash: string;
  now: Date;
}

export interface TouchAnonymousSessionParams {
  sessionId: string;
  now: Date;
}

export interface InvalidateAnonymousSessionParams {
  anonymousSessionId: string;
  response: Response;
}

export interface EnsureAnonymousPrincipalParams {
  request: Request;
  response: Response;
}
