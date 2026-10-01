import { ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { resolveCorsOrigin } from './common/security/cors.helpers';
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
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  const adminOrigin = config.get('ADMIN_ORIGIN', { infer: true });
  app.enableCors(
    (
      request: Request,
      callback: (error: Error | null, options: CorsOptions) => void,
    ) => {
      callback(null, {
        origin: resolveCorsOrigin({
          url: request.originalUrl,
          webOrigin,
          adminOrigin,
        }),
        credentials: true,
      });
    },
  );

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
