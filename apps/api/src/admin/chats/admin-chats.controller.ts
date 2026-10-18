import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AdminChatDetail,
  AdminChatSummaryState,
} from '@js-rag-stack/contracts';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminChatSummaryService } from './admin-chat-summary.service';
import { AdminChatsService } from './admin-chats.service';
import {
  AdminChatDetailDto,
  AdminChatSummaryStateDto,
} from './models/admin-chat-response.dto';

@ApiTags('admin-chats')
@ApiCookieAuth('admin_access_token')
@UseGuards(AdminAuthGuard)
@Controller('admin/chats')
export class AdminChatsController {
  constructor(
    private readonly chats: AdminChatsService,
    private readonly summaries: AdminChatSummaryService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Chat metadata and full transcript' })
  @ApiOkResponse({ type: AdminChatDetailDto })
  @ApiNotFoundResponse()
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminChatDetail> {
    return this.chats.getChat(id);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Cached chat summary and staleness' })
  @ApiOkResponse({ type: AdminChatSummaryStateDto })
  @ApiNotFoundResponse()
  getSummary(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminChatSummaryState> {
    return this.summaries.getSummary(id);
  }

  @Post(':id/summary')
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate or refresh the chat summary' })
  @ApiOkResponse({ type: AdminChatSummaryStateDto })
  @ApiConflictResponse()
  @ApiBadGatewayResponse()
  @ApiNotFoundResponse()
  refreshSummary(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminChatSummaryState> {
    return this.summaries.refreshSummary(id);
  }
}
