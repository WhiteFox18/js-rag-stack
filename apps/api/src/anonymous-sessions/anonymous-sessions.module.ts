import { Module } from '@nestjs/common';
import { AnonymousSessionsService } from './anonymous-sessions.service';
import { RequestPrincipalService } from './request-principal.service';

@Module({
  providers: [AnonymousSessionsService, RequestPrincipalService],
  exports: [AnonymousSessionsService, RequestPrincipalService],
})
export class AnonymousSessionsModule {}
