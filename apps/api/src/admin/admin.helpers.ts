import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminPrincipal } from '../common/models/admin-principal';

export const ADMIN_ROUTE_PREFIX = '/api/v1/admin';

export function isAdminPath(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0] ?? '';
  return (
    path === ADMIN_ROUTE_PREFIX || path.startsWith(`${ADMIN_ROUTE_PREFIX}/`)
  );
}

export function getAdminPrincipal(request: Request): AdminPrincipal {
  if (!request.admin) {
    throw new UnauthorizedException('Admin authentication is required.');
  }
  return request.admin;
}
