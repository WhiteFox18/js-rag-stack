import { Module } from '@nestjs/common';
import { ModelsModule } from '../../models/models.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminModelsController } from './admin-models.controller';

@Module({
  imports: [AdminAuthModule, ModelsModule],
  controllers: [AdminModelsController],
})
export class AdminModelsModule {}
