export const ADMIN_ROUTE_PREFIX = '/api/v1/admin';

export function isAdminPath(url: string | undefined): boolean {
  if (!url) return false;
  // Parse so absolute-form request lines compare by pathname; Express routing
  // is case-insensitive, so compare case-insensitively.
  let path: string;
  try {
    path = new URL(url, 'http://localhost').pathname.toLowerCase();
  } catch {
    return false;
  }
  return (
    path === ADMIN_ROUTE_PREFIX || path.startsWith(`${ADMIN_ROUTE_PREFIX}/`)
  );
}
