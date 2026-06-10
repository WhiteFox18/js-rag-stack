import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import type { AppEnvironment } from './config/environment.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppEnvironment, true>);

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  if (config.get('NODE_ENV', { infer: true }) === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Local LLM Chat API')
      .setDescription('HTTP API for the local-first LLM chat application.')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs-json',
    });
  }

  await app.listen(config.get('API_PORT', { infer: true }));
}

void bootstrap();
