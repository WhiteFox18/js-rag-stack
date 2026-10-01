import { isAdminPath } from '../utils/admin-path';
import type { ResolveCorsOriginParams } from './security.types';

// Admin routes trust only the admin app; every other route only the web app.
export function resolveCorsOrigin({
  url,
  webOrigin,
  adminOrigin,
}: ResolveCorsOriginParams): string {
  return isAdminPath(url) ? adminOrigin : webOrigin;
}
