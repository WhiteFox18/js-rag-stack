import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

describe('AppModule', () => {
  it('wires the authentication routes and Swagger contracts', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue({})
      .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').setVersion('1').build(),
    );

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/csrf',
        '/api/v1/auth/sign-up',
        '/api/v1/auth/sign-in',
        '/api/v1/auth/refresh',
        '/api/v1/auth/sign-out',
        '/api/v1/auth/sign-out-all',
        '/api/v1/auth/me',
        '/api/v1/auth/sessions',
        '/api/v1/auth/sessions/{sessionId}',
      ]),
    );
    expect(document.paths['/api/v1/auth/refresh']?.post?.security).toEqual([
      { refresh_token: [] },
    ]);

    await app.close();
  });
});
