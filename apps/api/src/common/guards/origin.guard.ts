import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppEnvironment } from '../../config/environment.schema';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigin: string;
  private readonly allowApiOrigin: boolean;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.allowedOrigin = config.get('WEB_ORIGIN', { infer: true });
    this.allowApiOrigin =
      config.get('NODE_ENV', { infer: true }) === 'development';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const origin = request.get('origin');

    if (origin === this.allowedOrigin) {
      return true;
    }

    const host = request.get('host');
    const apiOrigin = host ? `${request.protocol}://${host}` : undefined;

    if (this.allowApiOrigin && origin === apiOrigin) {
      return true;
    }

    throw new ForbiddenException('Request origin is not allowed.');
  }
}
