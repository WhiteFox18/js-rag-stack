export const ADMIN_ROUTE_PREFIX = '/api/v1/admin';

export function isAdminPath(url: string | undefined): boolean {
  if (!url) return false;
  // Express routing is case-insensitive, so compare case-insensitively.
  const path = (url.split('?')[0] ?? '').toLowerCase();
  return (
    path === ADMIN_ROUTE_PREFIX || path.startsWith(`${ADMIN_ROUTE_PREFIX}/`)
  );
}
