import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminModel, AdminModelsResponse } from '@js-rag-stack/contracts';
import { ModelAdministrationService } from '../../models/model-administration.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import {
  AdminModelDto,
  AdminModelsResponseDto,
} from './models/admin-models-response.dto';

@ApiTags('admin-models')
@ApiCookieAuth('admin_access_token')
@UseGuards(AdminAuthGuard)
@Controller('admin/models')
export class AdminModelsController {
  constructor(private readonly models: ModelAdministrationService) {}

  @Get()
  @ApiOperation({ summary: 'List all models with install status' })
  @ApiOkResponse({ type: AdminModelsResponseDto })
  async list(): Promise<AdminModelsResponse> {
    return { models: await this.models.listAll() };
  }

  @Post()
  @ApiOperation({ summary: 'Register a model' })
  @ApiOkResponse({ type: AdminModelDto })
  @ApiConflictResponse({ description: 'Duplicate name' })
  create(@Body() body: CreateModelDto): Promise<AdminModel> {
    return this.models.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit context size, availability or default' })
  @ApiOkResponse({ type: AdminModelDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Default model rules violated' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateModelDto,
  ): Promise<AdminModel> {
    return this.models.update({ id, input: body });
  }
}
