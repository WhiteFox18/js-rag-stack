import { isAdminPath } from '../src/admin/admin.helpers';

describe('isAdminPath', () => {
  it.each([
    ['/api/v1/admin', true],
    ['/api/v1/admin/users?page=2', true],
    ['/api/v1/admin/auth/sign-in', true],
    ['/api/v1/administrator', false],
    ['/api/v1/chats', false],
    [undefined, false],
  ])('%s → %s', (url, expected) => {
    expect(isAdminPath(url)).toBe(expected);
  });
});
