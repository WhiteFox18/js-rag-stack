import { CodedError } from '../../common/errors/coded-error';

export class AdminChatSummaryError extends CodedError {
  static inProgress(): AdminChatSummaryError {
    return new AdminChatSummaryError(
      'SUMMARY_IN_PROGRESS',
      'A summary for this chat is already being generated.',
      409,
    );
  }

  static failed(): AdminChatSummaryError {
    return new AdminChatSummaryError(
      'SUMMARY_FAILED',
      'The model returned an empty summary.',
      502,
    );
  }
}
