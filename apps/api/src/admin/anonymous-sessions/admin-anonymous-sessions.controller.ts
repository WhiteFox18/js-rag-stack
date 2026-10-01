import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AdminAnonymousDetail,
  AdminAnonymousListItem,
  Paginated,
  UsageRow,
} from '@js-rag-stack/contracts';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import {
  UsagePageQueryDto,
  UsageRangeQueryDto,
} from '../common/admin-query.dto';
import { toPageRequest, toUsageRange } from '../common/admin-query.helpers';
import { UsageRowsPageDto } from '../common/admin-usage.dto';
import { AdminAnonymousSessionsService } from './admin-anonymous-sessions.service';
import { ListAnonymousQueryDto } from './dto/list-anonymous-query.dto';
import {
  AdminAnonymousDetailDto,
  AdminAnonymousPageDto,
} from './models/admin-anonymous-response.dto';

@ApiTags('admin-anonymous-sessions')
@ApiCookieAuth('admin_access_token')
@UseGuards(AdminAuthGuard)
@Controller('admin/anonymous-sessions')
export class AdminAnonymousSessionsController {
  constructor(private readonly sessions: AdminAnonymousSessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List anonymous sessions with usage totals' })
  @ApiOkResponse({ type: AdminAnonymousPageDto })
  list(
    @Query() query: ListAnonymousQueryDto,
  ): Promise<Paginated<AdminAnonymousListItem>> {
    return this.sessions.list({
      sort: query.sort ?? 'lastActivity',
      range: toUsageRange(query),
      page: toPageRequest(query),
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Anonymous session usage totals and per-model breakdown',
  })
  @ApiOkResponse({ type: AdminAnonymousDetailDto })
  @ApiNotFoundResponse()
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: UsageRangeQueryDto,
  ): Promise<AdminAnonymousDetail> {
    return this.sessions.get({ id, range: toUsageRange(query) });
  }

  @Get(':id/usage')
  @ApiOperation({
    summary: 'Paginated usage log rows for an anonymous session',
  })
  @ApiOkResponse({ type: UsageRowsPageDto })
  @ApiNotFoundResponse()
  usage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: UsagePageQueryDto,
  ): Promise<Paginated<UsageRow>> {
    return this.sessions.usage({
      id,
      range: toUsageRange(query),
      page: toPageRequest(query),
    });
  }
}
