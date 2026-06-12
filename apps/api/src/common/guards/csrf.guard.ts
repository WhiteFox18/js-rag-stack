import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CsrfService } from '../security/csrf.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const cookies = request.cookies as Record<string, unknown> | undefined;
    const header = request.get(this.csrf.headerName);

    if (
      !this.csrf.validate({
        cookieToken: cookies?.[this.csrf.cookieName],
        headerToken: header,
      })
    ) {
      throw new ForbiddenException('Invalid CSRF token.');
    }

    return true;
  }
}
