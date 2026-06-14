import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestedId = request.get('x-request-id');
    request.requestId =
      requestedId && /^[A-Za-z0-9._:-]{1,128}$/.test(requestedId)
        ? requestedId
        : randomUUID();
    response.setHeader('X-Request-ID', request.requestId);
    next();
  }
}
