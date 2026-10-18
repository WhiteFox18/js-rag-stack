import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminChatDetail } from '@js-rag-stack/contracts';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminChatsService } from './admin-chats.service';
import { AdminChatDetailDto } from './models/admin-chat-response.dto';

@ApiTags('admin-chats')
@ApiCookieAuth('admin_access_token')
@UseGuards(AdminAuthGuard)
@Controller('admin/chats')
export class AdminChatsController {
  constructor(private readonly chats: AdminChatsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Chat metadata and full transcript' })
  @ApiOkResponse({ type: AdminChatDetailDto })
  @ApiNotFoundResponse()
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminChatDetail> {
    return this.chats.getChat(id);
  }
}
