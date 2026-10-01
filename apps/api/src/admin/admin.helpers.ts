import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminPrincipal } from '../common/models/admin-principal';

export function getAdminPrincipal(request: Request): AdminPrincipal {
  if (!request.admin) {
    throw new UnauthorizedException('Admin authentication is required.');
  }
  return request.admin;
}
