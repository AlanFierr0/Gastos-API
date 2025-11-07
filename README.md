# Gastos-API

Backend para página de gestión de gastos - API REST con NestJS, Prisma y PostgreSQL.

> Consulta `../DEV_NOTES.md` para convenciones de desarrollo y checklist de QA.

## Características

- API REST con NestJS
- Base de datos PostgreSQL con Prisma ORM
- Módulo de carga de archivos Excel (Upload)
- Módulo de gestión de registros (Records)
- Módulo de análisis de datos (Analytics)
- Validación de datos con class-validator
- Parseo de archivos Excel con xlsx
- Arquitectura limpia (Controllers, Services, Modules)

## Requisitos

- Node.js 16+ 
- PostgreSQL 12+
- npm o yarn

## Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/AlanFierr0/Gastos-API.git
cd Gastos-API
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
```

Editar `.env` con tus credenciales de PostgreSQL:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:6544/gastos_db?schema=public"
PORT=6543
```

4. Generar cliente de Prisma:
```bash
npm run prisma:generate
```

5. Ejecutar migraciones:
```bash
npm run prisma:migrate
```

## Uso

### Desarrollo
```bash
npm run start:dev
```

### Producción
```bash
npm run build
npm run start:prod
```

## Endpoints API

### Upload Module

#### Subir archivo Excel
```
POST /upload/excel
Content-Type: multipart/form-data
Body: file (Excel file)
```

El archivo Excel debe tener las siguientes columnas:
- `concepto` o `Concepto`: Descripción del gasto
- `monto` o `Monto`: Cantidad numérica
- `fecha` o `Fecha`: Fecha del gasto
- `categoria` o `Categoria` (opcional): Categoría del gasto
- `descripcion` o `Descripcion` (opcional): Descripción adicional

### Records Module

#### Crear registro
```
POST /records
Content-Type: application/json

{
  "concepto": "Compra de materiales",
  "monto": 150.50,
  "fecha": "2024-01-15",
  "categoria": "Materiales",
  "descripcion": "Descripción opcional"
}
```

#### Listar todos los registros
```
GET /records
```

#### Obtener registro por ID
```
GET /records/:id
```

#### Actualizar registro
```
PATCH /records/:id
Content-Type: application/json

{
  "monto": 200.00,
  "categoria": "Nueva categoría"
}
```

#### Eliminar registro
```
DELETE /records/:id
```

### Analytics Module

#### Total de gastos
```
GET /analytics/total
```

Respuesta:
```json
{
  "total": 1500.50,
  "count": 25
}
```

#### Gastos por categoría
```
GET /analytics/by-category
```

Respuesta:
```json
[
  {
    "categoria": "Materiales",
    "total": 500.00,
    "count": 10
  },
  {
    "categoria": "Servicios",
    "total": 300.50,
    "count": 5
  }
]
```

#### Gastos por mes
```
GET /analytics/by-month
```

Respuesta:
```json
[
  {
    "month": "2024-01",
    "total": 800.00,
    "count": 15
  },
  {
    "month": "2024-02",
    "total": 700.50,
    "count": 10
  }
]
```

#### Resumen completo
```
GET /analytics/summary
```

Respuesta:
```json
{
  "total": {
    "total": 1500.50,
    "count": 25
  },
  "byCategory": [...],
  "byMonth": [...]
}
```

## Estructura del Proyecto

```
src/
├── analytics/          # Módulo de análisis
│   ├── analytics.controller.ts
│   ├── analytics.service.ts
│   └── analytics.module.ts
├── records/            # Módulo de registros
│   ├── dto/
│   │   ├── create-record.dto.ts
│   │   └── update-record.dto.ts
│   ├── records.controller.ts
│   ├── records.service.ts
│   └── records.module.ts
├── upload/             # Módulo de carga de archivos
│   ├── dto/
│   │   └── create-record.dto.ts
│   ├── upload.controller.ts
│   ├── upload.service.ts
│   └── upload.module.ts
├── prisma/             # Servicio de Prisma
│   ├── prisma.service.ts
│   └── prisma.module.ts
├── app.module.ts       # Módulo raíz
└── main.ts             # Punto de entrada

prisma/
├── schema.prisma       # Schema de base de datos
└── migrations/         # Migraciones
```

## Tecnologías

- **NestJS** - Framework backend
- **Prisma** - ORM para PostgreSQL
- **PostgreSQL** - Base de datos
- **xlsx** - Parseo de archivos Excel
- **class-validator** - Validación de DTOs
- **class-transformer** - Transformación de datos
- **multer** - Manejo de archivos

## Scripts

```bash
npm run build           # Construir aplicación
npm run start           # Iniciar aplicación
npm run start:dev       # Modo desarrollo con watch
npm run start:prod      # Modo producción
npm run prisma:generate # Generar cliente Prisma
npm run prisma:migrate  # Ejecutar migraciones
npm run prisma:studio   # Abrir Prisma Studio
```

## Consideraciones de Seguridad

### xlsx Library
El proyecto utiliza la librería `xlsx` (versión 0.18.5) para el parseo de archivos Excel. Se han identificado vulnerabilidades conocidas en esta versión:
- ReDoS (Regular Expression Denial of Service)
- Prototype Pollution

**Recomendaciones:**
1. Valida y sanitiza todos los archivos Excel antes de procesarlos
2. Implementa límites de tamaño de archivo
3. Considera ejecutar el parseo en un proceso aislado
4. Monitorea el repositorio de SheetJS para actualizaciones de seguridad
5. Implementa validación adicional de los datos parseados antes de guardarlos en la base de datos

## Licencia

ISC
