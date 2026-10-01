export interface ValidateCsrfParams {
  cookieToken: unknown;
  headerToken: unknown;
}

export interface SafeEqualParams {
  left: string;
  right: string;
}

export interface ResolveCorsOriginParams {
  url: string | undefined;
  webOrigin: string;
  adminOrigin: string;
}
