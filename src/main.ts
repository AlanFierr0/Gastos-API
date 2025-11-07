import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Disable default to configure our own
  });
  
  // Configure body parser with no size limit - must be before other middleware
  app.use(express.json({ limit: Infinity }));
  app.use(express.urlencoded({ limit: Infinity, extended: true }));
  
  // Enable validation globally
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Enable CORS with explicit dev origins
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000', // swagger or same-origin tools
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Swagger (OpenAPI)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gastos API')
    .setDescription('API REST para gastos, ingresos, categorías, personas, analytics y carga de Excel')
    .setVersion('1.0.0')
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, doc);

  const port = Number(process.env.PORT) || 6543;
  await app.listen(port);
  
}

bootstrap();
