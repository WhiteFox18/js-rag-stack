import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { parseDurationMs } from '../../common/utils/duration';
import type { AppEnvironment } from '../../config/environment.schema';
import { ADMIN_ROUTE_PREFIX } from '../../common/utils/admin-path';
import type { AdminTokens } from './admin-auth.types';

const REFRESH_PATH = `${ADMIN_ROUTE_PREFIX}/auth`;

@Injectable()
export class AdminCookieService {
  readonly accessCookieName = 'admin_access_token';
  readonly refreshCookieName = 'admin_refresh_token';
  private readonly baseOptions: CookieOptions;
  private readonly accessMaxAge: number;
  private readonly refreshMaxAge: number;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.baseOptions = {
      httpOnly: true,
      secure: config.get('COOKIE_SECURE', { infer: true }),
      sameSite: config.get('COOKIE_SAME_SITE', { infer: true }),
      domain: config.get('COOKIE_DOMAIN', { infer: true }),
    };
    this.accessMaxAge = parseDurationMs(
      config.get('ADMIN_ACCESS_TTL', { infer: true }),
    );
    this.refreshMaxAge = parseDurationMs(
      config.get('ADMIN_REFRESH_TTL', { infer: true }),
    );
  }

  set(response: Response, tokens: AdminTokens): void {
    response.cookie(this.accessCookieName, tokens.accessToken, {
      ...this.baseOptions,
      path: ADMIN_ROUTE_PREFIX,
      maxAge: this.accessMaxAge,
    });
    response.cookie(this.refreshCookieName, tokens.refreshToken, {
      ...this.baseOptions,
      path: REFRESH_PATH,
      maxAge: this.refreshMaxAge,
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.accessCookieName, {
      ...this.baseOptions,
      path: ADMIN_ROUTE_PREFIX,
    });
    response.clearCookie(this.refreshCookieName, {
      ...this.baseOptions,
      path: REFRESH_PATH,
    });
  }
}
