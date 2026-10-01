import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CsrfResponseDto } from '../../common/security/csrf-response.dto';
import { CsrfService } from '../../common/security/csrf.service';
import { getCookie } from '../../common/utils/cookies';
import { getAdminPrincipal } from '../admin.helpers';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminCookieService } from './admin-cookie.service';
import { AdminSignInDto } from './dto/admin-sign-in.dto';
import { AdminAuthResponseDto } from './models/admin-response.dto';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly cookies: AdminCookieService,
    private readonly csrf: CsrfService,
  ) {}

  @Get('csrf')
  @ApiOperation({ summary: 'Issue a CSRF token for the admin app' })
  @ApiOkResponse({ type: CsrfResponseDto })
  getCsrf(@Res({ passthrough: true }) response: Response): CsrfResponseDto {
    return { csrfToken: this.csrf.issue(response) };
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in as an admin' })
  @ApiOkResponse({ type: AdminAuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async signIn(
    @Res({ passthrough: true }) response: Response,
    @Body() body: AdminSignInDto,
  ): Promise<AdminAuthResponseDto> {
    return { admin: await this.auth.signIn({ input: body, response }) };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate admin tokens' })
  @ApiOkResponse({ type: AdminAuthResponseDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminAuthResponseDto> {
    const rawToken = getCookie({
      request,
      name: this.cookies.refreshCookieName,
    });
    return { admin: await this.auth.refresh({ rawToken, response }) };
  }

  @Post('sign-out')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out the current admin session' })
  @ApiNoContentResponse()
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signOut({
      principal: getAdminPrincipal(request),
      response,
    });
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'Current admin profile' })
  @ApiOkResponse({ type: AdminAuthResponseDto })
  async me(@Req() request: Request): Promise<AdminAuthResponseDto> {
    return { admin: await this.auth.me(getAdminPrincipal(request).admin_id) };
  }
}
