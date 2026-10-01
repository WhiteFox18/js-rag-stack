import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAccountsRepository } from './admin-accounts.repository';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminCookieService } from './admin-cookie.service';
import { AdminSessionsRepository } from './admin-sessions.repository';
import { AdminTokenService } from './admin-token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [
    AdminAccountsRepository,
    AdminSessionsRepository,
    AdminTokenService,
    AdminCookieService,
    AdminAuthService,
    AdminAccountsService,
    AdminAuthGuard,
  ],
  exports: [
    AdminAuthGuard,
    AdminAuthService,
    AdminCookieService,
    AdminAccountsService,
  ],
})
export class AdminAuthModule {}
