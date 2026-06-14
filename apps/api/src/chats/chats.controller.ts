import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequestPrincipalService } from '../anonymous-sessions/request-principal.service';
import { ChatStreamService } from './chat-stream.service';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { StreamMessageDto } from './dto/stream-message.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import {
  ChatDetailDto,
  ChatPageDto,
  ChatSummaryDto,
} from './models/chat-response.dto';
import { encodeSseEvent, encodeSseHeartbeat } from './sse.helpers';
import { getPublicStreamError } from './chats.helpers';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

@ApiTags('chats')
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly streamService: ChatStreamService,
    private readonly principals: RequestPrincipalService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a chat for the current principal' })
  @ApiOkResponse({ type: ChatSummaryDto })
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: CreateChatDto,
  ) {
    const principal = await this.principals.ensureAnonymous({
      request,
      response,
    });
    return this.chats.create({
      principal,
      title: body.title ?? '',
      selectedModel: body.model,
      firstPrompt: body.firstPrompt,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List chats owned by the current principal' })
  @ApiOkResponse({ type: ChatPageDto })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  list(
    @Req() request: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.chats.list({
      principal: this.principals.require(request),
      cursor,
      limit: parsePageSize(limit),
      includeArchived: includeArchived === 'true',
    });
  }

  @Get(':chatId')
  @ApiOperation({ summary: 'Get chat metadata and a page of messages' })
  @ApiOkResponse({ type: ChatDetailDto })
  get(
    @Req() request: Request,
    @Param('chatId') chatId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chats.get({
      chatId,
      principal: this.principals.require(request),
      cursor,
      limit: parsePageSize(limit),
    });
  }

  @Patch(':chatId')
  @ApiOperation({
    summary: 'Rename, archive, or change the future model for a chat',
  })
  @ApiOkResponse({ type: ChatSummaryDto })
  update(
    @Req() request: Request,
    @Param('chatId') chatId: string,
    @Body() body: UpdateChatDto,
  ) {
    return this.chats.update({
      chatId,
      principal: this.principals.require(request),
      title: body.title,
      selectedModel: body.model,
      archived: body.archived,
    });
  }

  @Delete(':chatId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async delete(
    @Req() request: Request,
    @Param('chatId') chatId: string,
  ): Promise<void> {
    await this.chats.delete({
      chatId,
      principal: this.principals.require(request),
    });
  }

  @Post(':chatId/messages/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Persist a user message and stream an Ollama response as SSE',
  })
  @ApiProduces('text/event-stream')
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Named SSE events ending in completion, cancellation, or error.',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          example: 'event: message.delta\ndata: {"delta":"Hello"}\n\n',
        },
      },
    },
  })
  async stream(
    @Req() request: Request,
    @Res() response: Response,
    @Param('chatId') chatId: string,
    @Body() body: StreamMessageDto,
  ): Promise<void> {
    response.status(HttpStatus.OK);
    response.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();

    const controller = new AbortController();
    response.once('close', () => {
      if (!response.writableEnded) controller.abort();
    });
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(encodeSseHeartbeat());
    }, 15_000);

    try {
      await this.streamService.stream({
        chatId,
        principal: this.principals.require(request),
        content: body.content,
        model: body.model,
        signal: controller.signal,
        emit: (event) => {
          if (!response.writableEnded) response.write(encodeSseEvent(event));
        },
      });
    } catch (error) {
      if (!controller.signal.aborted && !response.writableEnded) {
        response.write(
          encodeSseEvent({
            event: 'stream.error',
            data: getPublicStreamError(error),
          }),
        );
      }
    } finally {
      clearInterval(heartbeat);
      if (!response.writableEnded) response.end();
    }
  }
}

function parsePageSize(value?: string): number {
  const parsed = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
}
