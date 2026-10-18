import { CodedError } from '../common/errors/coded-error';

export type OllamaErrorCode =
  | 'OLLAMA_UNAVAILABLE'
  | 'OLLAMA_TIMEOUT'
  | 'OLLAMA_INVALID_RESPONSE'
  | 'MODEL_NOT_ALLOWED'
  | 'MODEL_NOT_AVAILABLE';

export class OllamaError extends CodedError {
  constructor(
    override readonly code: OllamaErrorCode,
    message: string,
    status = 503,
  ) {
    super(code, message, status);
  }
}
