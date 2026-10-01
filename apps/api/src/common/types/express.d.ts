import type { AdminPrincipal } from '../models/admin-principal';
import type { RequestPrincipal } from '../models/request-principal';

declare global {
  namespace Express {
    interface Request {
      principal?: RequestPrincipal;
      admin?: AdminPrincipal;
      requestId?: string;
    }
  }
}

export {};
