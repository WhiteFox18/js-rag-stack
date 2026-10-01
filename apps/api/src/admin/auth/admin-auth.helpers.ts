import type { AdminProfile } from '@js-rag-stack/contracts';
import type { Admin } from '../../generated/prisma/client';

export function toAdminProfile(admin: Admin): AdminProfile {
  return { id: admin.id, email: admin.email, displayName: admin.display_name };
}

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}
