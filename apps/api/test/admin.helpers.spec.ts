import { BadRequestException } from '@nestjs/common';
import { toAdminChatDetail } from '../src/admin/chats/admin-chats.helpers';
import {
  escapeLike,
  toPageRequest,
  toUsageRange,
} from '../src/admin/common/admin-query.helpers';
import { parseCreateAdminArgs } from '../src/cli/create-admin.helpers';
import { resolveCorsOrigin } from '../src/common/security/cors.helpers';
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
    ['http://h/api/v1/admin/users', true],
    ['http://h/api/v1/chats?next=/api/v1/admin', false],
    [undefined, false],
  ])('%s → %s', (url, expected) => {
    expect(isAdminPath(url)).toBe(expected);
  });
});

describe('resolveCorsOrigin', () => {
  const origins = {
    webOrigin: 'http://web.test',
    adminOrigin: 'http://admin.test',
  };

  it.each([
    ['/api/v1/admin/users', 'http://admin.test'],
    ['/API/v1/Admin/users?x=1', 'http://admin.test'],
    ['/api/v1/chats', 'http://web.test'],
    [undefined, 'http://web.test'],
  ])('%s → %s', (url, expected) => {
    expect(resolveCorsOrigin({ url, ...origins })).toBe(expected);
  });
});

describe('parseCreateAdminArgs', () => {
  it('parses email and optional name', () => {
    expect(
      parseCreateAdminArgs(['--email', 'a@b.co', '--name', 'Ops']),
    ).toEqual({
      email: 'a@b.co',
      name: 'Ops',
    });
    expect(parseCreateAdminArgs(['--email=a@b.co'])).toEqual({
      email: 'a@b.co',
      name: null,
    });
  });

  it('requires --email', () => {
    expect(() => parseCreateAdminArgs([])).toThrow(
      'Usage: admin:create --email <email> [--name <name>]',
    );
  });
});

describe('admin query helpers', () => {
  it('defaults paging', () => {
    expect(toPageRequest({})).toEqual({ page: 1, pageSize: 25 });
    expect(toPageRequest({ page: 3, pageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
    });
  });

  it('parses ranges and rejects inverted ones', () => {
    expect(toUsageRange({})).toEqual({});
    expect(toUsageRange({ from: '2026-09-01', to: '2026-10-01' })).toEqual({
      from: new Date('2026-09-01'),
      to: new Date('2026-10-01'),
    });
    expect(() =>
      toUsageRange({ from: '2026-10-01', to: '2026-09-01' }),
    ).toThrow(BadRequestException);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});

describe('toAdminChatDetail', () => {
  const base = {
    id: 'c1',
    title: 'T',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    last_message_at: new Date('2026-01-02T00:00:00.000Z'),
    archived_at: null,
    selected_model: { name: 'qwen2.5:1.5b' },
    user: null,
    anonymous_session_id: null,
    messages: [
      {
        id: 'm1',
        role: 'ASSISTANT' as const,
        status: 'FAILED' as const,
        content: 'x',
        model: null,
        created_at: new Date('2026-01-01T00:00:01.000Z'),
        prompt_tokens: 1,
        completion_tokens: null,
      },
    ],
  };

  it('maps user owner, enums and dates', () => {
    const d = toAdminChatDetail({
      ...base,
      user: { id: 'u1', email: 'a@b.c' },
    });
    expect(d.chat.owner).toEqual({ type: 'user', id: 'u1', email: 'a@b.c' });
    expect(d.chat.model).toBe('qwen2.5:1.5b');
    expect(d.chat.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(d.messages[0]).toMatchObject({
      role: 'assistant',
      status: 'failed',
      createdAt: '2026-01-01T00:00:01.000Z',
      promptTokens: 1,
      completionTokens: null,
    });
  });

  it('maps anonymous and null owners', () => {
    expect(
      toAdminChatDetail({ ...base, anonymous_session_id: 's1' }).chat.owner,
    ).toEqual({ type: 'anonymous', id: 's1' });
    expect(toAdminChatDetail(base).chat.owner).toBeNull();
  });
});
