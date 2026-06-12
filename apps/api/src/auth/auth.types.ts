import type { Request, Response } from 'express';
import type {
  AnonymousPrincipal,
  RequestPrincipal,
} from '../common/models/request-principal';
import type { AuthSession, Prisma, User } from '../generated/prisma/client';
import type { SignInDto } from './dto/sign-in.dto';
import type { SignUpDto } from './dto/sign-up.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenClaims {
  sub: string;
  sessionId: string;
  jti: string;
  type: 'access' | 'refresh';
}

export interface SessionMetadata {
  userAgent: string | null;
  ipHash: string | null;
}

export interface SessionIdentity {
  id: string;
  userId: string;
  refreshJti: string;
}

export interface SessionCredentials {
  tokens: AuthTokens;
  refreshTokenHash: string;
}

export type CreateCredentials = (
  identity: SessionIdentity,
) => Promise<SessionCredentials>;

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string | null;
}

export interface CreateUserWithSessionParams {
  input: CreateUserInput;
  anonymousSessionId?: string;
  metadata: SessionMetadata;
  expiresAt: Date;
  createCredentials: CreateCredentials;
}

export interface CreateUserWithSessionResult {
  user: User;
  chatIds: string[];
  tokens: AuthTokens;
}

export interface CreateSessionWithTransferParams {
  userId: string;
  anonymousSessionId?: string;
  metadata: SessionMetadata;
  expiresAt: Date;
  createCredentials: CreateCredentials;
}

export interface CreateSessionWithTransferResult {
  chatIds: string[];
  tokens: AuthTokens;
}

export interface FindActiveAccessSessionParams {
  sessionId: string;
  userId: string;
}

export interface ActiveAccessSession {
  id: string;
  user_id: string;
}

export interface RotateSessionParams {
  session: AuthSession;
  metadata: SessionMetadata;
  expiresAt: Date;
  createCredentials: CreateCredentials;
}

export interface RevokeOwnedSessionParams {
  userId: string;
  sessionId: string;
}

export interface CreateSessionRecordParams {
  transaction: Prisma.TransactionClient;
  userId: string;
  metadata: SessionMetadata;
  expiresAt: Date;
  createCredentials: CreateCredentials;
}

export interface CreateSessionRecordResult {
  id: string;
  tokens: AuthTokens;
}

export interface TransferAnonymousChatsParams {
  transaction: Prisma.TransactionClient;
  anonymousSessionId: string;
  userId: string;
}

export interface SignUpParams {
  input: SignUpDto;
  principal?: RequestPrincipal;
  request: Request;
  response: Response;
}

export interface SignInParams {
  input: SignInDto;
  principal?: RequestPrincipal;
  request: Request;
  response: Response;
}

export interface RefreshParams {
  rawToken: string;
  request: Request;
  response: Response;
}

export interface ListSessionsParams {
  userId: string;
  currentSessionId: string;
}

export interface SignOutParams {
  sessionId: string;
  response: Response;
}

export interface SignOutAllParams {
  userId: string;
  response: Response;
}

export interface FinishAuthenticationParams {
  tokens: AuthTokens;
  anonymousPrincipal?: AnonymousPrincipal;
  transferredChatIds: string[];
  response: Response;
}

export interface VerifyTokenParams {
  rawToken: string;
  type: TokenClaims['type'];
}

export interface ValidateRefreshSessionParams {
  session: AuthSessionWithUser | null;
  claims: TokenClaims;
  rawToken: string;
}

export interface ToSessionResponseParams {
  session: AuthSession;
  currentSessionId: string;
}

export interface GetCookieParams {
  request: Request;
  name: string;
}

export interface SetAuthCookiesParams {
  response: Response;
  tokens: AuthTokens;
}

export type AuthSessionWithUser = Prisma.AuthSessionGetPayload<{
  include: { user: true };
}>;
