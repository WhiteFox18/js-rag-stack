import type { Request } from 'express';

export interface GetCookieParams {
  request: Request;
  name: string;
}
