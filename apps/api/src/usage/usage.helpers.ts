import type { RequestPrincipal } from '../common/models/request-principal';
import type {
  Prisma,
  UsageKind as DbUsageKind,
} from '../generated/prisma/client';
import type { OwnerColumns, UsageOwner, UsageQueryParams } from './usage.types';

export function toUsageOwner(
  principal: RequestPrincipal | null,
): UsageOwner | null {
  if (!principal) return null;
  return principal.type === 'authenticated'
    ? { type: 'user', id: principal.user_id }
    : { type: 'anonymous', id: principal.anonymous_session_id };
}

export function toOwnerColumns(owner: UsageOwner | null): OwnerColumns {
  if (!owner) return { user_id: null, anonymous_session_id: null };
  return owner.type === 'user'
    ? { user_id: owner.id, anonymous_session_id: null }
    : { user_id: null, anonymous_session_id: owner.id };
}

export function toTokenCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

export function toUsageWhere({
  owner,
  range,
}: UsageQueryParams): Prisma.UsageLogWhereInput {
  return {
    ...(owner.type === 'user'
      ? { user_id: owner.id }
      : { anonymous_session_id: owner.id }),
    ...(range.from || range.to
      ? { created_at: { gte: range.from, lt: range.to } }
      : {}),
  };
}

const WIRE_KINDS = {
  CHAT: 'chat',
  SUMMARY: 'summary',
  ADMIN_SUMMARY: 'admin_summary',
} as const satisfies Record<DbUsageKind, string>;

export function toWireKind(
  kind: DbUsageKind,
): (typeof WIRE_KINDS)[DbUsageKind] {
  return WIRE_KINDS[kind];
}

export function toSafeNumber(
  value: bigint | number | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'bigint' ? Number(value) : value;
}
