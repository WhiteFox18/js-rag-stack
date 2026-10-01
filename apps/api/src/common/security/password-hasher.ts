import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(params: { hash: string; plain: string }): Promise<boolean>;
}

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify({ hash, plain }: { hash: string; plain: string }) {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
