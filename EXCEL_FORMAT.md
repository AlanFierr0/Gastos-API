# Ejemplo de Archivo Excel

Para subir un archivo Excel a la API, debe tener la siguiente estructura:

## Columnas Requeridas

| Columna | Descripción | Tipo | Ejemplo |
|---------|-------------|------|---------|
| concepto o Concepto | Descripción del gasto | Texto | "Compra de materiales" |
| monto o Monto | Cantidad del gasto | Número | 150.50 |
| fecha o Fecha | Fecha del gasto | Fecha | 2024-01-15 |

## Columnas Opcionales

| Columna | Descripción | Tipo | Ejemplo |
|---------|-------------|------|---------|
| categoria o Categoria | Categoría del gasto | Texto | "Materiales" |
| descripcion o Descripcion | Descripción adicional | Texto | "Material de construcción" |

## Ejemplo de Contenido

```
| concepto              | monto   | fecha      | categoria    | descripcion              |
|-----------------------|---------|------------|--------------|--------------------------|
| Compra de materiales  | 150.50  | 2024-01-15 | Materiales   | Material de construcción |
| Pago de servicios     | 200.00  | 2024-01-16 | Servicios    | Electricidad             |
| Gastos de transporte  | 75.25   | 2024-01-17 | Transporte   | Combustible              |
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
2. Los campos vacíos serán ignorados
3. Las filas con datos inválidos serán omitidas
4. Solo se procesan archivos .xlsx y .xls
5. El archivo debe tener al menos una hoja de cálculo
6. La primera fila debe contener los nombres de las columnas
