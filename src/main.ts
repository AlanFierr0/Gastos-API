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

  // Enable CORS with configurable origins from environment variables
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000', // swagger or same-origin tools
        'http://app:5173', // Docker internal network
      ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // In development, allow any localhost origin
        if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
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
