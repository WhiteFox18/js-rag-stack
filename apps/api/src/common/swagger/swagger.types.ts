export interface SwaggerRequest {
  method?: string;
  headers?: Record<string, string>;
  credentials?: 'include' | 'omit' | 'same-origin';
}

export interface CsrfTokenResponse {
  csrfToken: string;
}
