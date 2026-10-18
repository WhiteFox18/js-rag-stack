import type { ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { CodedError } from '../src/common/errors/coded-error';

describe('ApiExceptionFilter', () => {
  it('maps any CodedError to its status and code', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'r1' }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter().catch(
      new CodedError('SUMMARY_IN_PROGRESS', 'x', 409),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'SUMMARY_IN_PROGRESS', message: 'x', requestId: 'r1' },
    });
  });
});
