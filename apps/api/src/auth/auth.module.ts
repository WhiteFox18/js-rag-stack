import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AnonymousSessionsModule } from '../anonymous-sessions/anonymous-sessions.module';
import { ChatsModule } from '../chats/chats.module';
import { AccessAuthGuard } from './access-auth.guard';
import { AuthController } from './auth.controller';
import { AuthCookieService } from './auth-cookie.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.register({}), AnonymousSessionsModule, ChatsModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, AuthCookieService, AccessAuthGuard],
  exports: [AuthService, AuthCookieService, AccessAuthGuard],
})
export class AuthModule {}
