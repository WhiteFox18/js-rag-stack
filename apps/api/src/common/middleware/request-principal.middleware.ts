import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AnonymousSessionsService } from '../../anonymous-sessions/anonymous-sessions.service';
import { AuthCookieService } from '../../auth/auth-cookie.service';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class RequestPrincipalMiddleware implements NestMiddleware {
  constructor(
    private readonly anonymousSessions: AnonymousSessionsService,
    private readonly auth: AuthService,
    private readonly authCookies: AuthCookieService,
  ) {}

  async use(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const accessToken = cookies?.[this.authCookies.accessCookieName];

    if (typeof accessToken === 'string') {
      request.principal = await this.auth.resolveAccessPrincipal(accessToken);
    }

    if (request.principal) {
      next();
      return;
    }

    const token = cookies?.[this.anonymousSessions.cookieName];

    if (typeof token === 'string') {
      request.principal = await this.anonymousSessions.resolvePrincipal(token);
    }

    next();
  }
}
