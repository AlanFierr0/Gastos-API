# Formato de Excel para Importación

El sistema acepta dos formatos de archivos Excel para importar gastos e ingresos:

## Formato 1: Formato Tradicional (Tabla)

Este formato es una tabla simple con columnas y filas de datos.

### Columnas Requeridas:
- **amount** o **monto** o **Monto** (obligatorio) - Monto del gasto/ingreso
- **date** o **fecha** o **Fecha** (obligatorio) - Fecha del registro

### Columnas Opcionales:
- **type** o **Type** - Tipo de registro: "income" (ingreso) o "expense" (gasto). Si no se especifica, se asume "expense"
- **categoria** o **category** o **Categoria** o **Category** - Nombre de la categoría
- **concepto** o **concept** o **Concepto** o **Concept** o **nombre** o **Nombre** - Concepto/descripción
- **currency** o **Currency** - Moneda (por defecto: ARS)
- **nota** o **Nota** o **notes** o **descripcion** o **Descripcion** - Notas adicionales

### Ejemplo:

| date       | amount | type   | categoria | concepto      | currency | nota        |
|------------|--------|--------|-----------|---------------|----------|-------------|
| 2024-01-15 | 5000   | expense| Alimentación | Supermercado | ARS      | Compra semanal |
| 2024-01-20 | 50000  | income | Trabajo   | Sueldo        | ARS      |              |

## Formato 2: Formato Planilla (Conceptos y Meses)

Este formato es una planilla donde la primera columna contiene conceptos y las siguientes columnas representan meses.

### Estructura:
- La primera columna debe contener "**Conceptos**" (preferiblemente en negrita) en la primera fila
- Las siguientes columnas deben contener nombres de meses (enero, febrero, marzo, etc.)
- Cada fila representa un concepto diferente
- Los valores en las celdas representan los montos para cada mes

### Ejemplo:

| Conceptos      | enero  | febrero | marzo | abril |
|----------------|--------|---------|-------|-------|
| Supermercado   | 5000   | 6000    | 5500  | 5800  |
| Transporte     | 2000   | 2000    | 2200  | 2000  |
| Servicios      | 3000   | 3000    | 3200  | 3000  |

### Notas sobre el Formato Planilla:
- El año se detecta automáticamente del nombre de la hoja (ej: "2024", "Hoja 2024")
- Si no se puede detectar el año, se usa el año actual
- Los conceptos en negrita se consideran categorías principales
- Los valores pueden ser positivos (gastos) o negativos (ingresos)

## Características Generales

- **Múltiples hojas**: Puedes tener diferentes hojas en el mismo archivo Excel
- **Detección automática de año**: Si el nombre de la hoja contiene un año (ej: "2024"), se usa ese año para todas las fechas
- **Límites**:
  - Tamaño máximo del archivo: 10MB
  - Máximo de filas: 10,000
- **Formatos soportados**: .xlsx, .xls

## Procesamiento

1. El sistema detecta automáticamente qué formato estás usando
2. Si encuentra "Conceptos" en la primera columna con meses, usa el formato planilla
3. Si no, usa el formato tradicional
4. Puedes revisar y editar los registros antes de confirmar la importación

