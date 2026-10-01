import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminCookieService } from './admin-cookie.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly cookies: AdminCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.cookies.accessCookieName];
    if (typeof token !== 'string') {
      throw new UnauthorizedException('Admin authentication is required.');
    }
    request.admin = await this.auth.authenticate(token);
    return true;
  }
}
