import { createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { AppEnvironment } from '../../config/environment.schema';
import { safeEqual } from './security.helpers';
import type { ValidateCsrfParams } from './security.types';

@Injectable()
export class CsrfService {
  readonly cookieName = 'csrf_token';
  readonly headerName = 'x-csrf-token';
  private readonly secret: string;
  private readonly cookieOptions: CookieOptions;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.secret = config.get('CSRF_SECRET', { infer: true });
    this.cookieOptions = {
      httpOnly: false,
      secure: config.get('COOKIE_SECURE', { infer: true }),
      sameSite: config.get('COOKIE_SAME_SITE', { infer: true }),
      domain: config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/',
    };
  }

  issue(response: Response): string {
    const nonce = randomBytes(32).toString('base64url');
    const token = `${nonce}.${this.sign(nonce)}`;
    response.cookie(this.cookieName, token, this.cookieOptions);
    return token;
  }

  validate({ cookieToken, headerToken }: ValidateCsrfParams): boolean {
    if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
      return false;
    }

    if (!safeEqual({ left: cookieToken, right: headerToken })) {
      return false;
    }

    const separator = cookieToken.lastIndexOf('.');

    if (separator < 1) {
      return false;
    }

    const nonce = cookieToken.slice(0, separator);
    const signature = cookieToken.slice(separator + 1);
    return safeEqual({ left: signature, right: this.sign(nonce) });
  }

  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}
