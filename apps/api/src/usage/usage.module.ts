import { Module } from '@nestjs/common';
import { UsageRecorderService } from './usage-recorder.service';
import { UsageRepository } from './usage.repository';
import { UsageTransferService } from './usage-transfer.service';

@Module({
  providers: [UsageRepository, UsageRecorderService, UsageTransferService],
  exports: [UsageRecorderService, UsageTransferService],
})
export class UsageModule {}
