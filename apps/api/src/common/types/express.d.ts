import type { RequestPrincipal } from '../models/request-principal';

declare global {
  namespace Express {
    interface Request {
      principal?: RequestPrincipal;
    }
  }
}

export {};
