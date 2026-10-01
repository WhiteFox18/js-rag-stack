import type { AdminSignInInput } from '@js-rag-stack/contracts';
import type { Response } from 'express';
import type { AdminPrincipal } from '../../common/models/admin-principal';
import type { Prisma } from '../../generated/prisma/client';

export interface AdminTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AdminTokenClaims {
  sub: string;
  sessionId: string;
  jti: string;
  type: 'access' | 'refresh';
}

export interface AdminSessionIdentity {
  id: string;
  adminId: string;
  refreshJti: string;
}

export interface AdminSessionCredentials {
  tokens: AdminTokens;
  refreshTokenHash: string;
}

export type CreateAdminCredentials = (
  identity: AdminSessionIdentity,
) => Promise<AdminSessionCredentials>;

export interface CreateAdminSessionParams {
  adminId: string;
  expiresAt: Date;
  createCredentials: CreateAdminCredentials;
}

export interface CreateAdminSessionRecordParams extends CreateAdminSessionParams {
  transaction: Prisma.TransactionClient;
}

export interface RotateAdminSessionParams extends CreateAdminSessionParams {
  sessionId: string;
}

export interface FindActiveAdminSessionParams {
  sessionId: string;
  adminId: string;
}

export interface VerifyAdminTokenParams {
  rawToken: string;
  type: AdminTokenClaims['type'];
}

export interface UpsertAdminRecord {
  email: string;
  password_hash: string;
  display_name: string | null;
}

export class AdminSessionRotatedError extends Error {}

export interface UpsertAdminParams {
  email: string;
  password: string;
  displayName?: string | null;
}

export interface AdminSignInParams {
  input: AdminSignInInput;
  response: Response;
}

export interface AdminRefreshParams {
  rawToken: string;
  response: Response;
}

export interface AdminSignOutParams {
  principal: AdminPrincipal;
  response: Response;
}
