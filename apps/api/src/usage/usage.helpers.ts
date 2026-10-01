import type { RequestPrincipal } from '../common/models/request-principal';
import type { OwnerColumns, UsageOwner } from './usage.types';

export function toUsageOwner(principal: RequestPrincipal): UsageOwner {
  return principal.type === 'authenticated'
    ? { type: 'user', id: principal.user_id }
    : { type: 'anonymous', id: principal.anonymous_session_id };
}

export function toOwnerColumns(owner: UsageOwner): OwnerColumns {
  return owner.type === 'user'
    ? { user_id: owner.id, anonymous_session_id: null }
    : { user_id: null, anonymous_session_id: owner.id };
}

export function toTokenCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}
