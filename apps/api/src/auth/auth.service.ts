import { createHmac, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import { AnonymousSessionsService } from '../anonymous-sessions/anonymous-sessions.service';
import { ChatHistoryService } from '../chats/chat-history.service';
import type { RequestPrincipal } from '../common/models/request-principal';
import {
  parseDurationMs,
  parseDurationSeconds,
} from '../common/utils/duration';
import type { AppEnvironment } from '../config/environment.schema';
import { AuthCookieService } from './auth-cookie.service';
import {
  capitalize,
  getAnonymousPrincipal,
  hashToken,
  isUniqueViolation,
  normalizeEmail,
  toAuthUser,
  toSessionResponse,
} from './auth.helpers';
import { AuthRepository, SessionAlreadyRotatedError } from './auth.repository';
import type {
  AuthSessionWithUser,
  AuthTokens,
  FinishAuthenticationParams,
  ListSessionsParams,
  RefreshParams,
  RevokeOwnedSessionParams,
  SessionCredentials,
  SessionIdentity,
  SessionMetadata,
  SignInParams,
  SignOutAllParams,
  SignOutParams,
  SignUpParams,
  TokenClaims,
  ValidateRefreshSessionParams,
  VerifyTokenParams,
} from './auth.types';
import type { AuthUserDto } from './models/auth-response.dto';
import type { SessionResponseDto } from './models/session-response.dto';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;
  private readonly refreshTtlMs: number;
  private readonly metadataHashSecret: string;

  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly cookies: AuthCookieService,
    private readonly anonymousSessions: AnonymousSessionsService,
    private readonly history: ChatHistoryService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.accessTtlSeconds = parseDurationSeconds(
      config.get('JWT_ACCESS_TTL', { infer: true }),
    );
    this.refreshTtlSeconds = parseDurationSeconds(
      config.get('JWT_REFRESH_TTL', { infer: true }),
    );
    this.refreshTtlMs = parseDurationMs(
      config.get('JWT_REFRESH_TTL', { infer: true }),
    );
    this.metadataHashSecret = config.get('CSRF_SECRET', { infer: true });
  }

  async signUp({
    input,
    principal,
    request,
    response,
  }: SignUpParams): Promise<AuthUserDto> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const anonymousPrincipal = getAnonymousPrincipal(principal);
    let creation;

    try {
      creation = await this.repository.createUserWithSession({
        input: {
          email: normalizeEmail(input.email),
          passwordHash,
          displayName: input.displayName?.trim() || null,
        },
        anonymousSessionId: anonymousPrincipal?.anonymous_session_id,
        metadata: this.getSessionMetadata(request),
        expiresAt: this.getRefreshExpiry(),
        createCredentials: (identity) =>
          this.createSessionCredentials(identity),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }
      throw error;
    }

    await this.finishAuthentication({
      tokens: creation.tokens,
      anonymousPrincipal,
      transferredChatIds: creation.chatIds,
      response,
    });
    return toAuthUser(creation.user);
  }

  async signIn({
    input,
    principal,
    request,
    response,
  }: SignInParams): Promise<AuthUserDto> {
    const user = await this.repository.findUserByEmail(
      normalizeEmail(input.email),
    );

    if (!user || !(await argon2.verify(user.password_hash, input.password))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const anonymousPrincipal = getAnonymousPrincipal(principal);
    const creation = await this.repository.createSessionWithTransfer({
      userId: user.id,
      anonymousSessionId: anonymousPrincipal?.anonymous_session_id,
      metadata: this.getSessionMetadata(request),
      expiresAt: this.getRefreshExpiry(),
      createCredentials: (identity) => this.createSessionCredentials(identity),
    });

    await this.finishAuthentication({
      tokens: creation.tokens,
      anonymousPrincipal,
      transferredChatIds: creation.chatIds,
      response,
    });
    return toAuthUser(user);
  }

  async refresh({
    rawToken,
    request,
    response,
  }: RefreshParams): Promise<AuthUserDto> {
    const claims = await this.verifyToken({ rawToken, type: 'refresh' });
    const session = this.validateRefreshSession({
      session: await this.repository.findSessionWithUser(claims.sessionId),
      claims,
      rawToken,
    });

    if (session.revoked_at) {
      if (session.replaced_by_session_id) {
        await this.repository.revokeRotationFamily(session);
      }
      throw new UnauthorizedException('Refresh token reuse detected.');
    }

    if (session.expires_at <= new Date()) {
      await this.repository.revokeSession(session.id);
      throw new UnauthorizedException('Refresh session has expired.');
    }

    try {
      const tokens = await this.repository.rotateSession({
        session,
        metadata: this.getSessionMetadata(request),
        expiresAt: this.getRefreshExpiry(),
        createCredentials: (identity) =>
          this.createSessionCredentials(identity),
      });
      this.cookies.set({ response, tokens });
    } catch (error) {
      if (error instanceof SessionAlreadyRotatedError) {
        throw new UnauthorizedException('Refresh token has already been used.');
      }
      throw error;
    }
    return toAuthUser(session.user);
  }

  async authenticateAccess(
    rawToken: string,
  ): Promise<Extract<RequestPrincipal, { type: 'authenticated' }>> {
    const claims = await this.verifyToken({ rawToken, type: 'access' });
    const session = await this.repository.findActiveAccessSession({
      sessionId: claims.sessionId,
      userId: claims.sub,
    });

    if (!session) {
      throw new UnauthorizedException('Authentication session is invalid.');
    }

    return {
      type: 'authenticated',
      user_id: session.user_id,
      auth_session_id: session.id,
    };
  }

  async resolveAccessPrincipal(
    rawToken: string,
  ): Promise<Extract<RequestPrincipal, { type: 'authenticated' }> | undefined> {
    try {
      return await this.authenticateAccess(rawToken);
    } catch {
      return undefined;
    }
  }

  async getUser(userId: string): Promise<AuthUserDto> {
    const user = await this.repository.findUserById(userId);

    if (!user) {
      throw new UnauthorizedException('Authenticated user no longer exists.');
    }
    return toAuthUser(user);
  }

  async listSessions({
    userId,
    currentSessionId,
  }: ListSessionsParams): Promise<SessionResponseDto[]> {
    const sessions = await this.repository.findActiveSessions(userId);
    return sessions.map((session) =>
      toSessionResponse({ session, currentSessionId }),
    );
  }

  async signOut({ sessionId, response }: SignOutParams): Promise<void> {
    await this.repository.revokeSession(sessionId);
    this.cookies.clear(response);
  }

  async signOutAll({ userId, response }: SignOutAllParams): Promise<void> {
    await this.repository.revokeAllSessions(userId);
    this.cookies.clear(response);
  }

  async revokeOwnedSession({
    userId,
    sessionId,
  }: RevokeOwnedSessionParams): Promise<void> {
    await this.repository.revokeOwnedSession({ userId, sessionId });
  }

  private async finishAuthentication({
    tokens,
    anonymousPrincipal,
    transferredChatIds,
    response,
  }: FinishAuthenticationParams): Promise<void> {
    this.cookies.set({ response, tokens });

    if (anonymousPrincipal) {
      this.anonymousSessions.clearCookie(response);
    }

    await Promise.all(
      transferredChatIds.map((chatId) => this.history.invalidate(chatId)),
    );
  }

  private async createSessionCredentials(
    identity: SessionIdentity,
  ): Promise<SessionCredentials> {
    const tokens = await this.createTokens(identity);
    return { tokens, refreshTokenHash: hashToken(tokens.refreshToken) };
  }

  private async createTokens(identity: SessionIdentity): Promise<AuthTokens> {
    const accessClaims: TokenClaims = {
      sub: identity.userId,
      sessionId: identity.id,
      jti: randomUUID(),
      type: 'access',
    };
    const refreshClaims: TokenClaims = {
      sub: identity.userId,
      sessionId: identity.id,
      jti: identity.refreshJti,
      type: 'refresh',
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessClaims, {
        secret: this.accessSecret,
        expiresIn: this.accessTtlSeconds,
      }),
      this.jwt.signAsync(refreshClaims, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTtlSeconds,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async verifyToken({
    rawToken,
    type,
  }: VerifyTokenParams): Promise<TokenClaims> {
    try {
      const claims = await this.jwt.verifyAsync<TokenClaims>(rawToken, {
        secret: type === 'access' ? this.accessSecret : this.refreshSecret,
      });

      if (
        claims.type !== type ||
        typeof claims.sub !== 'string' ||
        typeof claims.sessionId !== 'string' ||
        typeof claims.jti !== 'string'
      ) {
        throw new Error('Invalid token claims');
      }
      return claims;
    } catch {
      throw new UnauthorizedException(`${capitalize(type)} token is invalid.`);
    }
  }

  private validateRefreshSession({
    session,
    claims,
    rawToken,
  }: ValidateRefreshSessionParams): AuthSessionWithUser {
    if (
      !session ||
      session.refresh_jti !== claims.jti ||
      session.refresh_token_hash !== hashToken(rawToken)
    ) {
      throw new UnauthorizedException('Refresh session is invalid.');
    }
    return session;
  }

  private getRefreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtlMs);
  }

  private getSessionMetadata(request: Request): SessionMetadata {
    const userAgent = request.get('user-agent')?.slice(0, 512) ?? null;
    const ip = request.ip;
    return {
      userAgent,
      ipHash: ip
        ? createHmac('sha256', this.metadataHashSecret).update(ip).digest('hex')
        : null,
    };
  }
}
