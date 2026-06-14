import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { swaggerRequestInterceptor } from './common/swagger/swagger.helpers';
import type { AppEnvironment } from './config/environment.schema';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { createOpenApiDocument } from './common/swagger/openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppEnvironment, true>);

  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  if (config.get('NODE_ENV', { infer: true }) === 'development') {
    const document = createOpenApiDocument(app);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs-json',
      customSiteTitle: 'Local LLM Chat API',
      swaggerOptions: {
        withCredentials: true,
        requestInterceptor: swaggerRequestInterceptor,
      },
    });
  }

  await app.listen(config.get('API_PORT', { infer: true }));
}

void bootstrap();
