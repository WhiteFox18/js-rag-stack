import { NestFactory } from '@nestjs/core';
import { AdminAccountsService } from '../admin/auth/admin-accounts.service';
import { getErrorMessage } from '../common/utils/error';
import { AdminCliModule } from './admin-cli.module';
import { parseCreateAdminArgs, promptHidden } from './create-admin.helpers';

async function main(): Promise<void> {
  const { email, name } = parseCreateAdminArgs(process.argv.slice(2));
  const password = await promptHidden('Password: ');
  const confirmation = await promptHidden('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const app = await NestFactory.createApplicationContext(AdminCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const admin = await app.get(AdminAccountsService).upsert({
      email,
      password,
      displayName: name,
    });
    process.stdout.write(`Admin ready: ${admin.email} (${admin.id})\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${getErrorMessage(error)}\n`);
  process.exitCode = 1;
});
