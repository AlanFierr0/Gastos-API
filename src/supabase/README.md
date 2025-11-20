# Módulo Supabase (Opcional)

Este módulo es **opcional** y proporciona acceso directo al cliente de Supabase para usar funcionalidades específicas como:

- 📦 **Storage**: Subir y gestionar archivos
- 🔐 **Auth**: Autenticación de usuarios
- ⚡ **Realtime**: Subscripciones en tiempo real
- 🔧 **Edge Functions**: Ejecutar funciones serverless

## ¿Cuándo usar este módulo?

- ✅ **Usa este módulo** cuando necesites funcionalidades específicas de Supabase (Storage, Auth, Realtime)
- ❌ **No lo uses** si solo necesitas acceso a la base de datos PostgreSQL (usa `PrismaService`)

## Configuración

### 1. Configurar variables de entorno

En tu archivo `.env`:

```env
SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 2. Importar el módulo (si lo necesitas)

En `app.module.ts`:

```typescript
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    // ... otros módulos
    SupabaseModule, // ← Agregar solo si lo necesitas
  ],
})
export class AppModule {}
```

### 3. Usar el servicio

En cualquier servicio:

```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class MiServicio {
  constructor(private supabaseService: SupabaseService) {}

  async subirArchivo(file: Buffer) {
    // Verificar si Supabase está disponible
    if (!this.supabaseService.isAvailable()) {
      throw new Error('Supabase no está configurado');
    }

    // Usar funcionalidades de Supabase
    const data = await this.supabaseService.uploadFile(
      'mi-bucket',
      'ruta/archivo.jpg',
      file,
      'image/jpeg'
    );

    return data;
  }

  async obtenerUrlPublica() {
    const url = this.supabaseService.getPublicUrl(
      'mi-bucket',
      'ruta/archivo.jpg'
    );
    return url;
  }
}
```

## Ejemplos de uso

### Storage: Subir archivo

```typescript
const data = await this.supabaseService.uploadFile(
  'avatars',              // nombre del bucket
  'users/123/avatar.jpg', // ruta del archivo
  fileBuffer,             // buffer del archivo
  'image/jpeg'            // tipo de contenido
);
```

### Storage: Obtener URL pública

```typescript
const url = this.supabaseService.getPublicUrl(
  'avatars',
  'users/123/avatar.jpg'
);
// Retorna: https://xxxxxxxxxxxx.supabase.co/storage/v1/object/public/avatars/users/123/avatar.jpg
```

### Uso avanzado: Acceder al cliente directamente

```typescript
const client = this.supabaseService.getClient();

// Usar cualquier funcionalidad de Supabase
const { data, error } = await client
  .from('mi_tabla')
  .select('*')
  .eq('id', '123');
```

## Diferencia con PrismaService

| Característica | PrismaService | SupabaseService |
|----------------|---------------|-----------------|
| Acceso a BD PostgreSQL | ✅ | ✅ |
| ORM completo | ✅ | ❌ |
| Migraciones | ✅ | ❌ |
| Storage | ❌ | ✅ |
| Auth | ❌ | ✅ |
| Realtime | ❌ | ✅ |
| Edge Functions | ❌ | ✅ |

## Recomendación

**Para la mayoría de casos, usa solo `PrismaService`**. Este módulo de Supabase es opcional y solo debes usarlo si necesitas funcionalidades específicas que Prisma no proporciona.

## Recursos

- [Documentación de Supabase Storage](https://supabase.com/docs/guides/storage)
- [Documentación de Supabase Auth](https://supabase.com/docs/guides/auth)
- [Documentación de Supabase Realtime](https://supabase.com/docs/guides/realtime)

