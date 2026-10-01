import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { parseDurationSeconds } from '../../common/utils/duration';
import type { AppEnvironment } from '../../config/environment.schema';
import type {
  AdminSessionIdentity,
  AdminTokenClaims,
  AdminTokens,
  VerifyAdminTokenParams,
} from './admin-auth.types';

const AUDIENCE = 'admin';

@Injectable()
export class AdminTokenService {
  private readonly secret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.secret = config.get('ADMIN_JWT_SECRET', { infer: true });
    this.accessTtlSeconds = parseDurationSeconds(
      config.get('ADMIN_ACCESS_TTL', { infer: true }),
    );
    this.refreshTtlSeconds = parseDurationSeconds(
      config.get('ADMIN_REFRESH_TTL', { infer: true }),
    );
  }

  async sign(identity: AdminSessionIdentity): Promise<AdminTokens> {
    const base = { sub: identity.adminId, sessionId: identity.id };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        {
          ...base,
          jti: randomUUID(),
          type: 'access',
        } satisfies AdminTokenClaims,
        {
          secret: this.secret,
          expiresIn: this.accessTtlSeconds,
          audience: AUDIENCE,
        },
      ),
      this.jwt.signAsync(
        {
          ...base,
          jti: identity.refreshJti,
          type: 'refresh',
        } satisfies AdminTokenClaims,
        {
          secret: this.secret,
          expiresIn: this.refreshTtlSeconds,
          audience: AUDIENCE,
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  async verify({
    rawToken,
    type,
  }: VerifyAdminTokenParams): Promise<AdminTokenClaims> {
    let claims: AdminTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AdminTokenClaims>(rawToken, {
        secret: this.secret,
        audience: AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Admin authentication is invalid.');
    }
    if (
      claims.type !== type ||
      typeof claims.sub !== 'string' ||
      typeof claims.sessionId !== 'string' ||
      typeof claims.jti !== 'string'
    ) {
      throw new UnauthorizedException('Admin authentication is invalid.');
    }
    return claims;
  }
}
