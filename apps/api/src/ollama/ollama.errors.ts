export type OllamaErrorCode =
  | 'OLLAMA_UNAVAILABLE'
  | 'OLLAMA_TIMEOUT'
  | 'OLLAMA_INVALID_RESPONSE'
  | 'MODEL_NOT_ALLOWED'
  | 'MODEL_NOT_AVAILABLE';

export class OllamaError extends Error {
  constructor(
    readonly code: OllamaErrorCode,
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}
