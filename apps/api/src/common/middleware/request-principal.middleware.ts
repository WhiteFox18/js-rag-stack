import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AnonymousSessionsService } from '../../anonymous-sessions/anonymous-sessions.service';

@Injectable()
export class RequestPrincipalMiddleware implements NestMiddleware {
  constructor(private readonly anonymous_sessions: AnonymousSessionsService) {}

  async use(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.anonymous_sessions.cookie_name];

    if (typeof token === 'string') {
      request.principal = await this.anonymous_sessions.resolvePrincipal(token);
    }

    next();
  }
}
