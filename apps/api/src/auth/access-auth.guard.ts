import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthCookieService } from './auth-cookie.service';
import { AuthService } from './auth.service';

@Injectable()
export class AccessAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.cookies.accessCookieName];

    if (typeof token !== 'string') {
      throw new UnauthorizedException('Authentication is required.');
    }

    request.principal = await this.auth.authenticateAccess(token);
    return true;
  }
}
