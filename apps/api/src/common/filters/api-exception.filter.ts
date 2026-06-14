import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OllamaError } from '../../ollama/ollama.errors';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const { status, code, message } = getErrorDetails(error);

    response.status(status).json({
      error: {
        code,
        message,
        requestId: request.requestId ?? 'unknown',
      },
    });
  }
}

function getErrorDetails(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof OllamaError) {
    return { status: error.status, code: error.code, message: error.message };
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    return {
      status,
      code: getHttpErrorCode(status),
      message: error.message,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  };
}

function getHttpErrorCode(status: number): string {
  const codes: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  };
  return codes[status] ?? 'HTTP_ERROR';
}
