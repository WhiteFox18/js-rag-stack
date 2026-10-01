import { Injectable } from '@nestjs/common';
import type { Admin } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpsertAdminRecord } from './admin-auth.types';

@Injectable()
export class AdminAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { email } });
  }

  findById(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { id } });
  }

  upsert(data: UpsertAdminRecord): Promise<Admin> {
    return this.prisma.admin.upsert({
      where: { email: data.email },
      create: data,
      update: {
        password_hash: data.password_hash,
        display_name: data.display_name,
      },
    });
  }

  async touchSignIn(id: string): Promise<void> {
    await this.prisma.admin.update({
      where: { id },
      data: { last_sign_in_at: new Date() },
    });
  }
}
