import type { CsrfTokenResponse, SwaggerRequest } from './swagger.types';

export async function swaggerRequestInterceptor(
  request: SwaggerRequest,
): Promise<SwaggerRequest> {
  request.credentials = 'include';

  if (
    !['delete', 'patch', 'post', 'put'].includes(
      request.method?.toLowerCase() ?? '',
    )
  ) {
    return request;
  }

  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Swagger UI could not obtain a CSRF token.');
  }

  const { csrfToken } = (await response.json()) as CsrfTokenResponse;
  request.headers = {
    ...request.headers,
    'X-CSRF-Token': csrfToken,
  };
  return request;
}
