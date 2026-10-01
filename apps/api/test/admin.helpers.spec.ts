import { parseCreateAdminArgs } from '../src/cli/create-admin.helpers';
import { isAdminPath } from '../src/common/utils/admin-path';

describe('isAdminPath', () => {
  it.each([
    ['/api/v1/admin', true],
    ['/api/v1/admin/users?page=2', true],
    ['/api/v1/admin/auth/sign-in', true],
    ['/API/v1/Admin/users', true],
    ['/api/v1/ADMIN', true],
    ['/api/v1/ADMINISTRATOR', false],
    ['/api/v1/administrator', false],
    ['/api/v1/chats', false],
    [undefined, false],
  ])('%s → %s', (url, expected) => {
    expect(isAdminPath(url)).toBe(expected);
  });
});

describe('parseCreateAdminArgs', () => {
  it('parses email and optional name', () => {
    expect(parseCreateAdminArgs(['--email', 'a@b.co', '--name', 'Ops'])).toEqual({
      email: 'a@b.co',
      name: 'Ops',
    });
    expect(parseCreateAdminArgs(['--email=a@b.co'])).toEqual({ email: 'a@b.co', name: null });
  });

  it('requires --email', () => {
    expect(() => parseCreateAdminArgs([])).toThrow('Usage: admin:create --email <email> [--name <name>]');
  });
});
