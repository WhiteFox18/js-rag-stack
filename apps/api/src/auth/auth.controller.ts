import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CsrfService } from '../common/security/csrf.service';
import { AccessAuthGuard } from './access-auth.guard';
import { AuthCookieService } from './auth-cookie.service';
import { getAuthenticatedPrincipal, getCookie } from './auth.helpers';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { AuthResponseDto, CsrfResponseDto } from './models/auth-response.dto';
import { SessionResponseDto } from './models/session-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
    private readonly csrf: CsrfService,
  ) {}

  @Get('csrf')
  @ApiOperation({ summary: 'Issue a double-submit CSRF token' })
  @ApiOkResponse({ type: CsrfResponseDto })
  getCsrf(@Res({ passthrough: true }) response: Response): CsrfResponseDto {
    return { csrfToken: this.csrf.issue(response) };
  }

  @Post('sign-up')
  @ApiOperation({ summary: 'Create an account and authentication session' })
  @ApiOkResponse({ type: AuthResponseDto })
  async signUp(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: SignUpDto,
  ): Promise<AuthResponseDto> {
    const user = await this.auth.signUp({
      input: body,
      principal: request.principal,
      request,
      response,
    });
    return { user };
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and create a device session' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async signIn(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: SignInDto,
  ): Promise<AuthResponseDto> {
    const user = await this.auth.signIn({
      input: body,
      principal: request.principal,
      request,
      response,
    });
    return { user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({ summary: 'Rotate the refresh token and session' })
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const rawToken = getCookie({
      request,
      name: this.cookies.refreshCookieName,
    });
    const user = await this.auth.refresh({ rawToken, request, response });
    return { user };
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiNoContentResponse()
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signOut({
      sessionId: getAuthenticatedPrincipal(request).auth_session_id,
      response,
    });
  }

  @Post('sign-out-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiNoContentResponse()
  async signOutAll(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signOutAll({
      userId: getAuthenticatedPrincipal(request).user_id,
      response,
    });
  }

  @Get('me')
  @UseGuards(AccessAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOkResponse({ type: AuthResponseDto })
  async getMe(@Req() request: Request): Promise<AuthResponseDto> {
    const user = await this.auth.getUser(
      getAuthenticatedPrincipal(request).user_id,
    );
    return { user };
  }

  @Get('sessions')
  @UseGuards(AccessAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOkResponse({ type: SessionResponseDto, isArray: true })
  listSessions(@Req() request: Request): Promise<SessionResponseDto[]> {
    const principal = getAuthenticatedPrincipal(request);
    return this.auth.listSessions({
      userId: principal.user_id,
      currentSessionId: principal.auth_session_id,
    });
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiNoContentResponse()
  async revokeSession(
    @Req() request: Request,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.auth.revokeOwnedSession({
      userId: getAuthenticatedPrincipal(request).user_id,
      sessionId,
    });
  }
}
