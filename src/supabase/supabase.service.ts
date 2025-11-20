import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio opcional de Supabase
 * 
 * Este servicio proporciona acceso al cliente de Supabase para usar
 * funcionalidades específicas como Storage, Auth, Realtime, etc.
 * 
 * Si solo necesitas acceso a la base de datos, usa PrismaService
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabaseClient: SupabaseClient | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      this.supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      console.log('✅ Supabase client initialized');
    } else {
      console.log('⚠️  Supabase credentials not found - Supabase features disabled (only Prisma will be used)');
    }
  }

  getClient(): SupabaseClient {
    if (!this.supabaseClient) {
      throw new Error('Supabase client not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    }
    return this.supabaseClient;
  }

  /**
   * Verifica si el cliente de Supabase está disponible
   */
  isAvailable(): boolean {
    return this.supabaseClient !== null;
  }

  /**
   * Ejemplo: Subir archivo a Supabase Storage
   */
  async uploadFile(bucket: string, path: string, file: Buffer, contentType?: string) {
    const client = this.getClient();
    
    const { data, error } = await client.storage
      .from(bucket)
      .upload(path, file, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Error uploading file: ${error.message}`);
    }

    return data;
  }

  /**
   * Ejemplo: Obtener URL pública de un archivo
   */
  getPublicUrl(bucket: string, path: string): string {
    const client = this.getClient();
    
    const { data } = client.storage
      .from(bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  }
}

