import { Module } from '@nestjs/common';
import { UsageRecorderService } from './usage-recorder.service';
import { UsageReportingService } from './usage-reporting.service';
import { UsageRepository } from './usage.repository';
import { UsageTransferService } from './usage-transfer.service';

@Module({
  providers: [
    UsageRepository,
    UsageRecorderService,
    UsageTransferService,
    UsageReportingService,
  ],
  exports: [UsageRecorderService, UsageTransferService, UsageReportingService],
})
export class UsageModule {}
