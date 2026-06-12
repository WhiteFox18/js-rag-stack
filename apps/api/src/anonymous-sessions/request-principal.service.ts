import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestPrincipal } from '../common/models/request-principal';
import { AnonymousSessionsService } from './anonymous-sessions.service';

@Injectable()
export class RequestPrincipalService {
  constructor(private readonly anonymous_sessions: AnonymousSessionsService) {}

  require(request: Request): RequestPrincipal {
    if (!request.principal) {
      throw new UnauthorizedException('A valid request principal is required.');
    }

    return request.principal;
  }

  async ensureAnonymous(
    request: Request,
    response: Response,
  ): Promise<RequestPrincipal> {
    if (request.principal) {
      return request.principal;
    }

    const principal = await this.anonymous_sessions.create(response);
    request.principal = principal;
    return principal;
  }
}
