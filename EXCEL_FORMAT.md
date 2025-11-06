# Ejemplo de Archivo Excel

Para subir un archivo Excel a la API, debe tener la siguiente estructura:

## Columnas Requeridas

| Columna | Descripción | Tipo | Ejemplo |
|---------|-------------|------|---------|
| categoria o Categoria | Categoría agrupable | Texto | "Materiales" |
| nombre o Nombre | Nombre agrupable | Texto | "Compra de materiales" |
| nota o Nota | Observación libre | Texto | "Urgente" |
| monto o Monto | Cantidad | Número | 150.50 |
| fecha o Fecha | Fecha | Fecha | 2024-01-15 |

## Columnas Opcionales

| Columna | Descripción | Tipo | Ejemplo |
|---------|-------------|------|---------|
| currency o Currency | Moneda (ISO 4217) | Texto | "ARS" |

## Ejemplo de Contenido

```
| categoria   | nombre                 | nota        | monto   | fecha      |
|-------------|------------------------|-------------|---------|------------|
| Materiales  | Compra de materiales   | Urgente     | 150.50  | 2024-01-15 |
| Servicios   | Luz                    |             | 200.00  | 2024-01-16 |
| Transporte  | Combustible            | Nafta       | 75.25   | 2024-01-17 |
```

## Límites

- **Tamaño máximo del archivo**: 10 MB
- **Número máximo de filas**: 10,000 registros
- **Longitud máxima de texto**: 500 caracteres por campo

## Uso

Enviar una petición POST a `/upload/excel` con el archivo Excel:

```bash
curl -X POST http://localhost:3000/upload/excel \
  -F "file=@mi_archivo.xlsx"
```

## Notas Importantes

1. Las columnas pueden estar en mayúsculas o minúsculas
2. `categoria`, `nombre` y `nota` deben estar presentes (nota puede estar vacía)
3. Las filas con datos inválidos serán omitidas
4. Solo se procesan archivos .xlsx y .xls
5. El archivo debe tener al menos una hoja de cálculo
6. La primera fila debe contener los nombres de las columnas
