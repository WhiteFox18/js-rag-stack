import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CsrfGuard } from '../src/common/guards/csrf.guard';
import { OriginGuard } from '../src/common/guards/origin.guard';
import { CsrfService } from '../src/common/security/csrf.service';
import { swaggerRequestInterceptor } from '../src/common/swagger/swagger.helpers';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';

describe('security helpers', () => {
  const config = new ConfigService<AppEnvironment, true>(
    validateEnvironment({ NODE_ENV: 'test' }),
  );

  it('issues and validates signed double-submit CSRF tokens', () => {
    const csrf = new CsrfService(config);
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    const token = csrf.issue(response);

    expect(cookie).toHaveBeenCalledWith(
      csrf.cookieName,
      token,
      expect.objectContaining({ httpOnly: false, path: '/' }),
    );
    expect(csrf.validate({ cookieToken: token, headerToken: token })).toBe(
      true,
    );
    expect(
      csrf.validate({ cookieToken: token, headerToken: `${token}x` }),
    ).toBe(false);
    expect(
      csrf.validate({
        cookieToken: 'forged.value',
        headerToken: 'forged.value',
      }),
    ).toBe(false);
  });

  it('enforces origin and CSRF checks on state-changing requests', () => {
    const csrf = new CsrfService(config);
    const cookie = jest.fn();
    const token = csrf.issue({ cookie } as unknown as Response);
    const originGuard = new OriginGuard(config);
    const csrfGuard = new CsrfGuard(csrf);
    const validRequest = {
      method: 'POST',
      cookies: { [csrf.cookieName]: token },
      get: (name: string) =>
        name.toLowerCase() === 'origin'
          ? 'http://localhost:5173'
          : name.toLowerCase() === csrf.headerName
            ? token
            : undefined,
    } as unknown as Request;

    expect(originGuard.canActivate(createContext(validRequest))).toBe(true);
    expect(csrfGuard.canActivate(createContext(validRequest))).toBe(true);

    const invalidRequest = {
      method: 'POST',
      cookies: { [csrf.cookieName]: token },
      get: () => 'http://attacker.example',
    } as unknown as Request;
    expect(() =>
      originGuard.canActivate(createContext(invalidRequest)),
    ).toThrow(ForbiddenException);
  });

  it('allows Swagger same-origin mutations only in development', () => {
    const developmentConfig = new ConfigService<AppEnvironment, true>(
      validateEnvironment({ NODE_ENV: 'development' }),
    );
    const developmentGuard = new OriginGuard(developmentConfig);
    const sameOriginRequest = {
      method: 'POST',
      protocol: 'http',
      get: (name: string) =>
        name.toLowerCase() === 'origin'
          ? 'http://localhost:3000'
          : name.toLowerCase() === 'host'
            ? 'localhost:3000'
            : undefined,
    } as unknown as Request;

    expect(developmentGuard.canActivate(createContext(sameOriginRequest))).toBe(
      true,
    );
    expect(() =>
      new OriginGuard(config).canActivate(createContext(sameOriginRequest)),
    ).toThrow(ForbiddenException);
  });

  it('adds credentials and a fresh CSRF token to Swagger mutations', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ csrfToken: 'signed-token' }),
    } as unknown as Awaited<ReturnType<typeof fetch>>);

    await expect(
      swaggerRequestInterceptor({ method: 'POST', headers: {} }),
    ).resolves.toEqual({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': 'signed-token' },
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/csrf', {
      credentials: 'include',
    });

    fetchMock.mockRestore();
  });
});

function createContext(request: Request): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
