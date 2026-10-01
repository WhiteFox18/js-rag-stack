import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminProfile } from '@js-rag-stack/contracts';
import type { AdminPrincipal } from '../../common/models/admin-principal';
import { PasswordHasher } from '../../common/security/password-hasher';
import { hashToken, safeEqual } from '../../common/security/security.helpers';
import { parseDurationMs } from '../../common/utils/duration';
import type { AppEnvironment } from '../../config/environment.schema';
import { normalizeAdminEmail, toAdminProfile } from './admin-auth.helpers';
import {
  AdminSessionRotatedError,
  type AdminSessionCredentials,
  type AdminSessionIdentity,
  type AdminRefreshParams,
  type AdminSignInParams,
  type AdminSignOutParams,
} from './admin-auth.types';
import { AdminAccountsRepository } from './admin-accounts.repository';
import { AdminCookieService } from './admin-cookie.service';
import { AdminSessionsRepository } from './admin-sessions.repository';
import { AdminTokenService } from './admin-token.service';

const INVALID_CREDENTIALS = 'Invalid email or password.';

@Injectable()
export class AdminAuthService {
  private readonly refreshTtlMs: number;
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly accounts: AdminAccountsRepository,
    private readonly sessions: AdminSessionsRepository,
    private readonly tokens: AdminTokenService,
    private readonly cookies: AdminCookieService,
    private readonly passwords: PasswordHasher,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.refreshTtlMs = parseDurationMs(
      config.get('ADMIN_REFRESH_TTL', { infer: true }),
    );
  }

  async signIn({ input, response }: AdminSignInParams): Promise<AdminProfile> {
    const admin = await this.accounts.findByEmail(
      normalizeAdminEmail(input.email),
    );
    // Verify against a dummy hash for unknown emails so timing does not reveal accounts.
    const hash = admin?.password_hash ?? (await this.getDummyHash());
    const valid = await this.passwords.verify({ hash, plain: input.password });
    if (!admin || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);

    const tokens = await this.sessions.create({
      adminId: admin.id,
      expiresAt: this.refreshExpiry(),
      createCredentials: (identity) => this.credentials(identity),
    });
    await this.accounts.touchSignIn(admin.id);
    this.cookies.set(response, tokens);
    return toAdminProfile(admin);
  }

  async refresh({
    rawToken,
    response,
  }: AdminRefreshParams): Promise<AdminProfile> {
    const claims = await this.tokens.verify({ rawToken, type: 'refresh' });
    const session = await this.sessions.findById(claims.sessionId);
    if (
      !session ||
      session.admin_id !== claims.sub ||
      session.refresh_jti !== claims.jti ||
      session.revoked_at ||
      session.expires_at <= new Date() ||
      !safeEqual({
        left: session.refresh_token_hash,
        right: hashToken(rawToken),
      })
    ) {
      throw new UnauthorizedException('Admin refresh token is invalid.');
    }
    const admin = await this.accounts.findById(session.admin_id);
    if (!admin)
      throw new UnauthorizedException('Admin refresh token is invalid.');

    try {
      const tokens = await this.sessions.rotate({
        sessionId: session.id,
        adminId: admin.id,
        expiresAt: this.refreshExpiry(),
        createCredentials: (identity) => this.credentials(identity),
      });
      this.cookies.set(response, tokens);
    } catch (error) {
      if (error instanceof AdminSessionRotatedError) {
        throw new UnauthorizedException('Admin refresh token is invalid.');
      }
      throw error;
    }
    return toAdminProfile(admin);
  }

  async authenticate(rawAccessToken: string): Promise<AdminPrincipal> {
    const claims = await this.tokens.verify({
      rawToken: rawAccessToken,
      type: 'access',
    });
    const session = await this.sessions.findActive({
      sessionId: claims.sessionId,
      adminId: claims.sub,
    });
    if (!session) throw new UnauthorizedException('Admin session is invalid.');
    return { admin_id: session.admin_id, admin_session_id: session.id };
  }

  async signOut({ principal, response }: AdminSignOutParams): Promise<void> {
    await this.sessions.revoke(principal.admin_session_id);
    this.cookies.clear(response);
  }

  async me(adminId: string): Promise<AdminProfile> {
    const admin = await this.accounts.findById(adminId);
    if (!admin) throw new UnauthorizedException('Admin no longer exists.');
    return toAdminProfile(admin);
  }

  private async credentials(
    identity: AdminSessionIdentity,
  ): Promise<AdminSessionCredentials> {
    const tokens = await this.tokens.sign(identity);
    return { tokens, refreshTokenHash: hashToken(tokens.refreshToken) };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtlMs);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash('dummy-password-for-timing');
    return this.dummyHash;
  }
}
