import { Module } from '@nestjs/common';
import { AnonymousSessionsService } from './anonymous-sessions.service';
import { AnonymousSessionsRepository } from './anonymous-sessions.repository';
import { RequestPrincipalService } from './request-principal.service';

@Module({
  providers: [
    AnonymousSessionsService,
    AnonymousSessionsRepository,
    RequestPrincipalService,
  ],
  exports: [AnonymousSessionsService, RequestPrincipalService],
})
export class AnonymousSessionsModule {}
