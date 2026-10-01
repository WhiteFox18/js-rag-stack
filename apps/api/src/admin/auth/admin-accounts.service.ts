import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdminProfile } from '@js-rag-stack/contracts';
import { PasswordHasher } from '../../common/security/password-hasher';
import type { UpsertAdminParams } from './admin-auth.types';
import { normalizeAdminEmail, toAdminProfile } from './admin-auth.helpers';
import { AdminAccountsRepository } from './admin-accounts.repository';

export const ADMIN_PASSWORD_MIN_LENGTH = 12;

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly accounts: AdminAccountsRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async upsert({
    email,
    password,
    displayName = null,
  }: UpsertAdminParams): Promise<AdminProfile> {
    if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(
        `Admin passwords must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
      );
    }
    const admin = await this.accounts.upsert({
      email: normalizeAdminEmail(email),
      password_hash: await this.passwords.hash(password),
      display_name: displayName?.trim() || null,
    });
    return toAdminProfile(admin);
  }
}
