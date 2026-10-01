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
  AdminUserDetail,
  AdminUserListItem,
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
import { AdminUsersService } from './admin-users.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import {
  AdminUserDetailDto,
  AdminUsersPageDto,
} from './models/admin-users-response.dto';

@ApiTags('admin-users')
@ApiCookieAuth('admin_access_token')
@UseGuards(AdminAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with usage totals' })
  @ApiOkResponse({ type: AdminUsersPageDto })
  list(
    @Query() query: ListUsersQueryDto,
  ): Promise<Paginated<AdminUserListItem>> {
    return this.users.list({
      search: query.search,
      sort: query.sort ?? 'lastActivity',
      range: toUsageRange(query),
      page: toPageRequest(query),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'User usage totals and per-model breakdown' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiNotFoundResponse()
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: UsageRangeQueryDto,
  ): Promise<AdminUserDetail> {
    return this.users.get({ id, range: toUsageRange(query) });
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Paginated usage log rows for a user' })
  @ApiOkResponse({ type: UsageRowsPageDto })
  @ApiNotFoundResponse()
  usage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: UsagePageQueryDto,
  ): Promise<Paginated<UsageRow>> {
    return this.users.usage({
      id,
      range: toUsageRange(query),
      page: toPageRequest(query),
    });
  }
}
