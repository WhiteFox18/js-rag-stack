import { Global, Module } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { Argon2PasswordHasher, PasswordHasher } from './password-hasher';

@Global()
@Module({
  providers: [
    CsrfService,
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
  ],
  exports: [CsrfService, PasswordHasher],
})
export class SecurityModule {}
