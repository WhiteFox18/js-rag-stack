import {
  toOwnerColumns,
  toUsageOwner,
  toWireKind,
} from '../src/usage/usage.helpers';

describe('usage helpers', () => {
  it('maps a null principal to no owner columns', () => {
    expect(toOwnerColumns(toUsageOwner(null))).toEqual({
      user_id: null,
      anonymous_session_id: null,
    });
  });

  it('maps principals to owner columns', () => {
    expect(
      toOwnerColumns(
        toUsageOwner({
          type: 'authenticated',
          user_id: 'u1',
          auth_session_id: 's1',
        }),
      ),
    ).toEqual({ user_id: 'u1', anonymous_session_id: null });
  });

  it('maps ADMIN_SUMMARY to admin_summary', () => {
    expect(toWireKind('ADMIN_SUMMARY')).toBe('admin_summary');
    expect(toWireKind('SUMMARY')).toBe('summary');
    expect(toWireKind('CHAT')).toBe('chat');
  });
});
