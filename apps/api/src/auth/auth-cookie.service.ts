import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { AppEnvironment } from '../config/environment.schema';
import { parseDurationMs } from '../common/utils/duration';
import type { SetAuthCookiesParams } from './auth.types';

@Injectable()
export class AuthCookieService {
  readonly accessCookieName = 'access_token';
  readonly refreshCookieName = 'refresh_token';
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
      config.get('JWT_ACCESS_TTL', { infer: true }),
    );
    this.refreshMaxAge = parseDurationMs(
      config.get('JWT_REFRESH_TTL', { infer: true }),
    );
  }

  set({ response, tokens }: SetAuthCookiesParams): void {
    response.cookie(this.accessCookieName, tokens.accessToken, {
      ...this.baseOptions,
      path: '/',
      maxAge: this.accessMaxAge,
    });
    response.cookie(this.refreshCookieName, tokens.refreshToken, {
      ...this.baseOptions,
      path: '/api/v1/auth',
      maxAge: this.refreshMaxAge,
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.accessCookieName, {
      ...this.baseOptions,
      path: '/',
    });
    response.clearCookie(this.refreshCookieName, {
      ...this.baseOptions,
      path: '/api/v1/auth',
    });
  }
}
