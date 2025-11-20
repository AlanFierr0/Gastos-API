import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './supabase.service';

/**
 * Módulo opcional de Supabase
 * 
 * Este módulo es opcional y solo necesario si quieres usar
 * funcionalidades específicas de Supabase como Storage, Auth, Realtime, etc.
 * 
 * Si solo necesitas acceso a la base de datos PostgreSQL, 
 * el módulo PrismaModule es suficiente.
 * 
 * Para usar este módulo:
 * 1. Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en tu .env
 * 2. Importa este módulo en app.module.ts
 * 3. Inyecta SupabaseService en tus servicios
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}

