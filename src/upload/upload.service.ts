import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { normalizeCategoryName } from '../common/utils/category.util';
import type { Express } from 'express';
import OpenAI from 'openai';
import axios from 'axios';

@Injectable()
export class UploadService {
  private readonly MAX_ROWS = 10000; // Limit to prevent DoS
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  
  // Mapeo de comercios a categorías y conceptos (para mapeo automático)
  private readonly MERCHANT_MAPPINGS: Array<{
    merchant: string; // Nombre del comercio (case-insensitive, puede ser parcial)
    categoryName: string; // Nombre de la categoría
    concept: string; // Nombre del concepto
  }> = [
    { merchant: 'VELEZ SARSFIELD', categoryName: 'Salud', concept: 'deportes' },
    { merchant: 'Fravega', categoryName: 'Mantenimiento casa', concept: 'electronica' },
    { merchant: 'Colorin', categoryName: 'Mantenimiento casa', concept: 'mejoras y arreglos' },
    { merchant: 'SINTEPLAST-LA PISTA', categoryName: 'Mantenimiento casa', concept: 'mejoras y arreglos' },
    { merchant: 'Zurich seguros', categoryName: 'servicio', concept: 'seguro hogar' },
    { merchant: 'ADRIANA BESSONE', categoryName: 'Salud', concept: 'Medicos y medicamentos' },
    { merchant: 'ALEXANDER FLEMING', categoryName: 'Salud', concept: 'Medicos y medicamentos' },
    { merchant: 'Farmacity', categoryName: 'Salud', concept: 'Medicos y medicamentos' },
    { merchant: 'SCHOCKBA', categoryName: 'Bienestar', concept: 'salidas' },
    { merchant: 'Kansas', categoryName: 'Bienestar', concept: 'salidas' },
    { merchant: 'LCD', categoryName: 'automotores', concept: 'Combustible' },
    { merchant: 'Apple', categoryName: 'servicios', concept: 'apple icloud' },
    { merchant: 'PEDIDOSYA', categoryName: 'Bienestar', concept: 'salidas' },
    { merchant: 'Lucciano', categoryName: 'Bienestar', concept: 'salidas' },
    { merchant: 'CAMINO PQUE B AY', categoryName: 'automotores', concept: 'peaje' },
    { merchant: 'CHICLANAPARK 492', categoryName: 'automotores', concept: 'estacionamiento' },
    { merchant: 'GRANJASMARIA', categoryName: 'alimentación', concept: 'polleria' },
    { merchant: 'uber', categoryName: 'automotores', concept: 'parking' },
    { merchant: 'COTO', categoryName: 'alimentación', concept: 'supermercado' },
    { merchant: 'CARREFOUR', categoryName: 'alimentación', concept: 'supermercado' },
    { merchant: 'JUMBO', categoryName: 'alimentación', concept: 'supermercado' },
    { merchant: 'TELECENTRO', categoryName: 'servicios', concept: 'internet' },
    { merchant: 'Movistar', categoryName: 'servicios', concept: 'Telefonos moviles' },
  ];

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService
  ) {}
  

  async parseExcel(file: Express.Multer.File) {
    // Security: Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    // Parse Excel file with ExcelJS (better support for cell styles)
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);

    if (workbook.worksheets.length === 0) {
      throw new BadRequestException('Excel file contains no sheets');
    }
    const allRecords: any[] = [];
    const allErrors: any[] = [];
    const allWarnings: any[] = [];

    for (const worksheet of workbook.worksheets) {
      if (!worksheet) continue;

      const sheetYear = this.extractYearFromSheetName(worksheet.name);

      const arrayData = this.extractSheetData(worksheet);

      if (arrayData.length === 0) {
        allWarnings.push({
          sheet: worksheet.name,
          item: worksheet.name,
          reason: 'La hoja está vacía y se omitió del procesamiento.',
        });
        continue;
      }

      if (arrayData.length > this.MAX_ROWS) {
        throw new BadRequestException(`La hoja "${worksheet.name}" supera el máximo de ${this.MAX_ROWS} filas soportadas.`);
      }

      try {
        const isPlanillaFormat = this.detectPlanillaFormat(arrayData, worksheet);
        if (isPlanillaFormat) {
          const result = await this.parsePlanillaFormat(arrayData, worksheet, sheetYear);
          allRecords.push(...result.records);
          allErrors.push(...result.errors);
          allWarnings.push(...result.warnings);
          continue;
        }

        const result = this.parseTraditionalFormat(worksheet, sheetYear);
        allRecords.push(...result.records);
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        allErrors.push({
          sheet: worksheet.name,
          item: worksheet.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      records: allRecords,
      total: allRecords.length,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  private extractSheetData(worksheet: ExcelJS.Worksheet): any[][] {
    const arrayData: any[][] = [];
    worksheet.eachRow((row, rowNumber) => {
      const rowData: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let value: any = cell.value;

        if (value === null || value === undefined) {
          value = '';
        } else if (typeof value === 'object') {
          if ('result' in value) {
            value = value.result;
          } else if ('text' in value) {
            value = value.text;
          } else if ('richText' in value) {
            value = value.richText.map((rt: any) => rt.text || '').join('');
          } else if ('value' in value) {
            value = value.value;
          } else {
            const numValue = Number(value);
            value = !isNaN(numValue) ? numValue : String(value);
          }
        }

        rowData[colNumber - 1] = value;
      });
      arrayData[rowNumber - 1] = rowData;
    });

    return arrayData;
  }

  private parseTraditionalFormat(worksheet: ExcelJS.Worksheet, sheetYear?: number) {
    const data: any[] = [];
    const headers: string[] = [];
    const warnings: any[] = [];
    const errors: any[] = [];

    const firstRow = worksheet.getRow(1);
    firstRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value || '');
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData: any = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (!header) return;
        let value: any = cell.value;
        if (value && typeof value === 'object' && 'text' in value) {
          value = value.text;
        } else if (value && typeof value === 'object' && 'result' in value) {
          value = value.result;
        }
        rowData[header] = value;
      });
      if (Object.keys(rowData).length > 0) {
        data.push(rowData);
      }
    });

    if (data.length === 0) {
      throw new BadRequestException('Excel file is empty or could not be parsed');
    }

    const first = data[0] as any;
    const hasAmount = first && (first['amount'] !== undefined || first['monto'] !== undefined || first['Monto'] !== undefined);
    const hasDate = first && (first['date'] !== undefined || first['fecha'] !== undefined || first['Fecha'] !== undefined);

    if (!hasAmount || !hasDate) {
      const availableColumns = Object.keys(first || {}).join(', ');
      throw new BadRequestException(`El archivo no tiene las columnas requeridas. Columnas encontradas: "${availableColumns}". Se requieren: "amount" (o "monto") y "date" (o "fecha"). Si tu archivo es una planilla con conceptos y meses, asegurate de que tenga una fila con "Conceptos" en la primera columna.`);
    }

    const parsedRecords = [] as any[];
    for (const row of data) {
      const type = (this.sanitizeString(row['type'] || row['Type']) || '').toLowerCase();
      const amount = this.parseNumber(row['amount'] || row['monto'] || row['Monto']);
      const rawDateValue = row['date'] || row['fecha'] || row['Fecha'];
      let date = this.parseDate(rawDateValue);

      if (sheetYear !== undefined) {
        if (date) {
          date = new Date(Date.UTC(sheetYear, date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
        } else if (rawDateValue) {
          const month = this.extractMonthFromValue(rawDateValue);
          if (month !== null) {
            date = new Date(Date.UTC(sheetYear, month - 1, 1, 12, 0, 0, 0));
          }
        }

        if (!date) {
          date = new Date(Date.UTC(sheetYear, 0, 1, 12, 0, 0, 0));
          warnings.push({
            sheet: worksheet.name,
            row,
            reason: 'No se pudo determinar el mes; se utilizó enero por defecto basado en el nombre de la hoja.',
            sheetYear,
          });
        }
      }

      if (amount === null || !date) {
        warnings.push({
          sheet: worksheet.name,
          row,
          reason: 'Fila omitida por no tener monto o fecha válidos.',
        });
        continue;
      }

      const categoria = normalizeCategoryName(row['categoria'] || row['category'] || row['Categoria'] || row['Category']);
      const concepto = this.sanitizeString(row['concepto'] || row['Concepto'] || row['concept'] || row['Concept'] || row['nombre'] || row['Nombre']);
      const rawNota = this.sanitizeString(row['nota'] || row['Nota'] || row['notes'] || row['descripcion'] || row['Descripcion']);
      const currency = (this.sanitizeString(row['currency'] || row['Currency']) || 'ARS').toUpperCase();

      if (!categoria) {
        errors.push({
          sheet: worksheet.name,
          row,
          reason: 'Cada registro debe tener una categoría definida.',
        });
        continue;
      }

      if (!concepto) {
        errors.push({
          sheet: worksheet.name,
          row,
          reason: 'Cada registro debe tener un concepto definido.',
        });
        continue;
      }

      if (type === 'income') {
        parsedRecords.push({
          kind: 'income',
          categoria,
          concepto,
          nombre: concepto,
          nota: rawNota || '',
          amount,
          date: date.toISOString(),
          currency,
        });
      } else {
        parsedRecords.push({
          kind: 'expense',
          categoria,
          concepto,
          nombre: concepto,
          nota: rawNota || '',
          amount,
          date: date.toISOString(),
          currency,
        });
      }
    }

    return {
      records: parsedRecords,
      errors,
      warnings,
    };
  }

  private extractYearFromSheetName(name: string): number | undefined {
    if (!name) return undefined;
    const match = name.match(/(20\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 1900 && year <= 2500) {
        return year;
      }
    }
    return undefined;
  }

  private extractMonthFromValue(value: any): number | null {
    if (value === null || value === undefined) return null;
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const normalized = String(value).trim().toLowerCase();
    const numericMatch = normalized.match(/(\d{1,2})/);
    if (numericMatch) {
      const month = parseInt(numericMatch[1], 10);
      if (month >= 1 && month <= 12) {
        return month;
      }
    }
    const nameIndex = monthNames.indexOf(normalized);
    if (nameIndex !== -1) {
      const mapping = [1,2,3,4,5,6,7,8,9,9,10,11,12];
      return mapping[nameIndex];
    }
    return null;
  }

  async saveParsedRecords(records: any[], parseErrors: any[] = [], parseWarnings: any[] = [], expenseTypeMap: Record<string, string> = {}) {
    const savedRecords: any[] = [];
    const saveErrors: any[] = [];
    const saveWarnings: any[] = [];

    const pushError = (index: number, record: any, message: string) => {
      saveErrors.push({
        index,
        record: {
          kind: record.kind,
          categoria: record.categoria,
          concepto: record.concepto,
          amount: record.amount,
          date: record.date,
          note: record.note ?? record.notes ?? record.nota ?? null,
        },
        error: message,
      });
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      try {
        const recordDate = record.date;
        if (!recordDate) {
          pushError(i, record, 'Registro sin fecha válida.');
          continue;
        }

        const categoryName = normalizeCategoryName(record.categoria || record.categoryName || record.category?.name);
        if (!categoryName) {
          pushError(i, record, 'La categoría es obligatoria en cada registro.');
          continue;
        }

        const conceptName = this.sanitizeString(
          record.concepto ||
          record.nombre ||
          record.name ||
          record.concept ||
          record.notes ||
          record.nota
        );

        if (!conceptName) {
          pushError(i, record, 'El concepto es obligatorio en cada registro.');
          continue;
        }

        const notesValue = this.sanitizeString(record.nota || record.notes || record.note);
        const normalizedDate = this.normalizeDateToMonthYear(recordDate);

        if (record.kind === 'income') {
          const incomeType = await this.prisma.categoryType.upsert({
            where: { name: 'income' },
            update: {},
            create: { name: 'income' },
          });

          const existingCategory = await this.prisma.category.findFirst({
            where: {
              name: categoryName,
              typeId: incomeType.id,
            },
          });

          const category = existingCategory || (await this.prisma.category.create({
            data: { name: categoryName, typeId: incomeType.id },
          }));

          const incomeData = {
            concept: conceptName,
            amount: record.amount,
            date: normalizedDate,
            note: notesValue || null,
            currency: record.currency,
            categoryId: category.id,
            isRecurring: record.isRecurring ?? false,
          } as unknown as Prisma.IncomeUncheckedCreateInput;

          const created = await this.prisma.income.create({
            data: incomeData,
            include: { category: true },
          });

          savedRecords.push({ kind: 'income', ...created });
        } else {
          const expenseType = await this.prisma.categoryType.upsert({
            where: { name: 'expense' },
            update: {},
            create: { name: 'expense' },
          });

          const existingCategory = await this.prisma.category.findFirst({
            where: {
              name: categoryName,
              typeId: expenseType.id,
            },
          });

          const category = existingCategory || (await this.prisma.category.create({
            data: { name: categoryName, typeId: expenseType.id },
          }));

          // Get expenseType from map using category::concept key, default to MENSUAL
          const conceptKey = `${categoryName.toLowerCase()}::${conceptName.toLowerCase()}`;
          const expenseTypeValue = expenseTypeMap[conceptKey] || 'MENSUAL';

          const expenseData = {
            categoryId: category.id,
            concept: conceptName,
            amount: record.amount,
            date: normalizedDate,
            note: notesValue || null,
            currency: record.currency,
            expenseType: expenseTypeValue as any,
          } as unknown as Prisma.ExpenseUncheckedCreateInput;

          const created = await this.prisma.expense.create({
            data: expenseData,
            include: { category: true },
          });

          savedRecords.push({ kind: 'expense', ...created });
        }
      } catch (error) {
        pushError(i, record, error instanceof Error ? error.message : String(error));
      }
    }

    const allErrors = [...parseErrors, ...saveErrors];
    const allWarnings = [...parseWarnings, ...saveWarnings];

    let message = `${savedRecords.length} registros importados exitosamente`;
    if (allErrors.length > 0) {
      message += `. ${allErrors.length} error(es) durante el procesamiento.`;
    }
    if (allWarnings.length > 0) {
      message += `. ${allWarnings.length} advertencia(s).`;
    }

    return {
      success: true,
      message,
      records: savedRecords,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  async parseAndSaveExcel(file: Express.Multer.File) {
    // Use parseExcel and saveParsedRecords
    const parsed = await this.parseExcel(file);
    return this.saveParsedRecords(parsed.records, parsed.errors || [], parsed.warnings || []);
  }

  private sanitizeString(value: any): string | null {
    if (!value) return null;
    const str = String(value).trim();
    // Remove potentially harmful characters and limit length
    return str.length > 500 ? str.substring(0, 500) : str;
  }

  private parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return !isNaN(num) && isFinite(num) ? num : null;
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return null;
      // Normalize to first day of month (only month and year)
      return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0));
    } catch {
      return null;
    }
  }

  // Helper function to normalize any date to first day of month (only month and year)
  private normalizeDateToMonthYear(date: Date | string): Date {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid date: ${date}`);
    }
    // Normalize to day 1, month, year, and set time to 12:00:00 UTC
    // This ensures we only store month and year, not the specific day or time
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12, 0, 0, 0));
  }

  private detectPlanillaFormat(arrayData: any[][], worksheet: ExcelJS.Worksheet): boolean {
    // Helper function to check if a cell is bold using ExcelJS
    const isCellBold = (rowIndex: number, colIndex: number): boolean => {
      try {
        const row = worksheet.getRow(rowIndex + 1); // ExcelJS is 1-indexed
        const cell = row.getCell(colIndex + 1); // ExcelJS is 1-indexed
        if (cell && cell.font) {
          return cell.font.bold === true;
        }
      } catch (e) {
        // If we can't check bold, return false
      }
      return false;
    };

    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                        'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    // First pass: try to find "Conceptos" in bold in column A (index 0)
    for (let i = 0; i < Math.min(100, arrayData.length); i++) {
      const row = arrayData[i];
      
      if (row && row[0] !== null && row[0] !== undefined && row[0] !== '') {
        // Normalize: remove extra spaces, convert to lowercase, remove special characters that might interfere
        const firstCell = String(row[0]).trim().toLowerCase().replace(/\s+/g, ' ');
        
        // Check if it contains "conceptos" (more flexible matching)
        if (firstCell.includes('conceptos')) {
          const isBold = isCellBold(i, 0);
          
          // Check if this row has month names
          let monthCount = 0;
          
          for (let j = 1; j < Math.min(row.length, 20); j++) {
            const cell = String(row[j] || '').trim().toLowerCase();
            if (monthNames.includes(cell)) {
              monthCount++;
            }
          }
          
          // Accept if we have at least 3 months (prefer bold, but accept non-bold too)
          if (monthCount >= 3) {
            // If it's bold, return immediately
            if (isBold) {
              return true;
            }
            // If not bold but has months, continue to check if there's a bold one later
            // but for now, accept this as a valid match
          }
        }
      }
    }

    // Second pass: if not found in bold, try without bold requirement (fallback)
    for (let i = 0; i < Math.min(100, arrayData.length); i++) {
      const row = arrayData[i];
      
      if (row && row[0] !== null && row[0] !== undefined && row[0] !== '') {
        // Normalize: remove extra spaces, convert to lowercase
        const firstCell = String(row[0]).trim().toLowerCase().replace(/\s+/g, ' ');
        
        // Check if it contains "conceptos" (more flexible matching)
        if (firstCell.includes('conceptos')) {
          // Check if this row has month names
          let monthCount = 0;
          
          for (let j = 1; j < Math.min(row.length, 20); j++) {
            const cell = String(row[j] || '').trim().toLowerCase();
            if (monthNames.includes(cell)) {
              monthCount++;
            }
          }
          
          // Accept if we have at least 3 months
          if (monthCount >= 3) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  private async parsePlanillaFormat(arrayData: any[][], worksheet: ExcelJS.Worksheet, sheetYear?: number): Promise<{ records: any[]; total: number; errors: any[]; warnings: any[] }> {
    const parsedRecords = [];
    const errors: any[] = [];
    const warnings: any[] = [];
    
    // Helper function to check if a cell is bold using ExcelJS
    // ExcelJS has much better support for reading cell styles
    const isCellBold = (rowIndex: number, colIndex: number): boolean => {
      try {
        const row = worksheet.getRow(rowIndex + 1); // ExcelJS is 1-indexed
        const cell = row.getCell(colIndex + 1); // ExcelJS is 1-indexed
        if (cell && cell.font) {
          return cell.font.bold === true;
        }
      } catch (e) {
        // If we can't check bold, return false
      }
      return false;
    };

    // Step 1: Find "Conceptos" in column A (index 0) - prefer bold, but accept non-bold as fallback
    let headerRowIndex = -1;
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                        'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 11, 12]; // setiembre and septiembre both map to 9
    
    // First pass: try to find "Conceptos" in bold in column A
    for (let i = 0; i < Math.min(100, arrayData.length); i++) {
      const row = arrayData[i];
      if (row && row[0] !== null && row[0] !== undefined && row[0] !== '') {
        // Normalize: remove extra spaces, convert to lowercase
        const firstCell = String(row[0]).trim().toLowerCase().replace(/\s+/g, ' ');
        // Check if it contains "conceptos" (more flexible matching)
        if (firstCell.includes('conceptos') && isCellBold(i, 0)) {
          // Verify it has months in the row
          let monthCount = 0;
          for (let j = 1; j < Math.min(row.length, 20); j++) {
            const cell = String(row[j] || '').trim().toLowerCase();
            if (monthNames.includes(cell)) {
              monthCount++;
            }
          }
          if (monthCount >= 3) {
            headerRowIndex = i;
            break;
          }
        }
      }
    }

    // Second pass: if not found in bold, try without bold requirement
    if (headerRowIndex === -1) {
      for (let i = 0; i < Math.min(100, arrayData.length); i++) {
      const row = arrayData[i];
      if (row && row[0] !== null && row[0] !== undefined && row[0] !== '') {
          // Normalize: remove extra spaces, convert to lowercase
          const firstCell = String(row[0]).trim().toLowerCase().replace(/\s+/g, ' ');
          // Check if it contains "conceptos" (more flexible matching)
          if (firstCell.includes('conceptos')) {
            // Verify it has months in the row
            let monthCount = 0;
            for (let j = 1; j < Math.min(row.length, 20); j++) {
              const cell = String(row[j] || '').trim().toLowerCase();
              if (monthNames.includes(cell)) {
                monthCount++;
              }
            }
            if (monthCount >= 3) {
          headerRowIndex = i;
          break;
            }
          }
        }
      }
    }

    if (headerRowIndex === -1) {
      // Try to provide helpful debugging info
      let sampleCells = '';
      for (let i = 0; i < Math.min(10, arrayData.length); i++) {
        const row = arrayData[i];
        if (row && row[0] !== null && row[0] !== undefined) {
          sampleCells += `"${String(row[0])}", `;
        }
      }
      throw new BadRequestException(`No se pudo encontrar la fila con "Conceptos" en la columna A (primera columna). Verificá que tu archivo tenga una fila con "Conceptos" en la primera columna, seguida de nombres de meses (Enero, Febrero, etc.). Primeras celdas encontradas en columna A: ${sampleCells}`);
    }

    const headerRow = arrayData[headerRowIndex];
    
    // Step 2: Find year from sheet name or from first row fallback
    let year = sheetYear ?? new Date().getFullYear();
    if (sheetYear === undefined && arrayData[0] && arrayData[0][0] !== null && arrayData[0][0] !== undefined) {
      const firstCellValue = arrayData[0][0];
      if (typeof firstCellValue === 'number') {
        const yearCandidate = firstCellValue;
        if (yearCandidate >= 2000 && yearCandidate <= 2100) {
          year = yearCandidate;
        }
      }
    }

    // Step 3: Map month columns to their indices
    const monthColumnMap: { [key: number]: number } = {}; // month number -> column index
    
    for (let j = 1; j < headerRow.length; j++) {
      const cell = String(headerRow[j] || '').trim().toLowerCase();
      // Check if this is a month
      const monthIndex = monthNames.indexOf(cell);
      if (monthIndex !== -1) {
        monthColumnMap[monthNumbers[monthIndex]] = j;
      }
    }
    
    if (Object.keys(monthColumnMap).length === 0) {
      throw new BadRequestException('No se pudieron encontrar las columnas de meses en la fila de encabezados. Verificá que la fila con "Conceptos" tenga nombres de meses (Enero, Febrero, etc.).');
    }
    
    // Step 4: Parse data rows starting after header row
    let currentCategory: string | null = null;
    let lastItemName: string | null = null; // Track last item name for continuation rows
    
    for (let i = headerRowIndex + 1; i < Math.min(arrayData.length, headerRowIndex + 1000); i++) {
      const row = arrayData[i] as any[];
      if (!row) continue;
      
      // Check if row has any data in month columns (even if first cell is empty)
      const hasMonthData = Object.values(monthColumnMap).some(colIndex => {
        const monthValue = row[colIndex];
        if (monthValue === null || monthValue === undefined) return false;
        if (typeof monthValue === 'string' && monthValue.trim() === '') return false;
        // Try to parse as number
        let numValue: number;
        if (typeof monthValue === 'object') {
          if ('result' in monthValue) {
            numValue = monthValue.result;
          } else if ('value' in monthValue) {
            numValue = monthValue.value;
          } else {
            numValue = Number(monthValue);
          }
        } else {
          const strValue = String(monthValue).trim();
          if (strValue === '') return false;
          // Try to parse number from string
          const cleaned = strValue.replace(/[$,\s]/g, '').replace(/\./g, '').replace(',', '.');
          numValue = parseFloat(cleaned);
        }
        return !isNaN(numValue) && isFinite(numValue) && numValue !== 0;
      });
      
      // Get first cell value
      const firstCellRaw = row[0];
      const firstCellValue = firstCellRaw ? this.sanitizeString(firstCellRaw) : null;
      const hasFirstCell = firstCellValue && firstCellValue.trim() !== '';
      
      // Skip rows with no data at all
      if (!hasFirstCell && !hasMonthData) {
        continue;
      }

      // If first cell is empty but we have month data, use last item name
      if (!hasFirstCell && hasMonthData && lastItemName) {
        // Continue processing with last item name (this handles continuation rows)
      } else if (!hasFirstCell) {
        continue; // No first cell and no month data, skip
      }

      // Check if this row is a category:
      // 1. First cell should be in bold (if detectable)
      // 2. Must not have data in any month column
      // 3. The next row should have data in month columns (indicating items below)
      const isBold = isCellBold(i, 0);
      
      // Check if all month columns are empty (no data in any month)
      // A value is considered "empty" if it's null, undefined, empty string, whitespace only, 0, or not a valid number
      let allMonthsEmpty = true;
      for (const [columnIndex] of Object.entries(monthColumnMap)) {
        const value = row[columnIndex];
        
        // Skip if value is null, undefined, or empty string
        if (value === null || value === undefined || value === '') {
          continue;
        }
        
        // Handle strings: check if it's just whitespace
        if (typeof value === 'string' && value.trim() === '') {
          continue; // It's just whitespace, treat as empty
        }
        
        // Handle ExcelJS objects
        let processedValue = value;
        if (typeof value === 'object' && value !== null) {
          if ('result' in value) {
            processedValue = value.result;
          } else if ('value' in value) {
            processedValue = value.value;
          } else {
            processedValue = Number(value);
          }
        }
        
        // Try to convert to number
        let numValue: number;
        if (typeof processedValue === 'number') {
          numValue = processedValue;
        } else if (typeof processedValue === 'string') {
          const cleaned = processedValue.trim()
            .replace(/[$€£¥]/g, '')
            .replace(/\s/g, '');
          const hasDots = cleaned.includes('.');
          const hasCommas = cleaned.includes(',');
          
          if (hasDots && hasCommas) {
            const lastDot = cleaned.lastIndexOf('.');
            const lastComma = cleaned.lastIndexOf(',');
            numValue = lastDot > lastComma
              ? parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
              : parseFloat(cleaned.replace(/,/g, ''));
          } else if (hasCommas) {
            const commaCount = (cleaned.match(/,/g) || []).length;
            numValue = commaCount > 1 
              ? parseFloat(cleaned.replace(/,/g, ''))
              : parseFloat(cleaned.replace(',', '.'));
          } else if (hasDots) {
            const dotCount = (cleaned.match(/\./g) || []).length;
            numValue = dotCount > 1 
              ? parseFloat(cleaned.replace(/\./g, ''))
              : parseFloat(cleaned);
          } else {
            numValue = parseFloat(cleaned);
          }
        } else {
          numValue = Number(processedValue);
        }
        
        const isNumber = typeof numValue === 'number' && !isNaN(numValue) && isFinite(numValue);
        
        // If it's a valid number and not zero, then this month has data
        if (isNumber && numValue !== 0) {
          allMonthsEmpty = false;
          break;
        }
      }

      // A row is a category ONLY if:
      // 1. It's in bold (required)
      // 2. It has no data in any month column
      // We only use bold detection, no fallback to avoid false positives
      
      if (isBold && allMonthsEmpty) {
        currentCategory = firstCellValue.trim();
        continue; // Skip the category row itself, we'll process items below it
      }

      // If not a category, it's an item belonging to the current category
      if (!currentCategory) {
        continue; // Skip items without a category
      }

      // Use first cell value if available, otherwise use last item name
      let itemName = hasFirstCell ? firstCellValue.trim() : (lastItemName || '');
      if (!itemName) {
        continue; // Skip if no item name available
      }
      
      // Update last item name if we have a new first cell value
      if (hasFirstCell) {
        lastItemName = itemName;
      }

      // Remove text in parentheses from itemName (ignore it completely)
      itemName = itemName.replace(/\s*\([^)]+\)\s*/g, '').trim();

      const sanitizedCategory = this.sanitizeString(currentCategory);
      const sanitizedConcept = this.sanitizeString(itemName);

      if (!sanitizedCategory || !sanitizedConcept) {
        warnings.push({
          sheet: worksheet.name,
          row: i + 1,
          category: currentCategory,
          item: itemName,
          reason: 'Se omitió la fila por no tener categoría o concepto válidos.',
        });
        continue;
      }

      // Process each month column for this item
      for (const [monthStr, columnIndex] of Object.entries(monthColumnMap)) {
        const month = parseInt(monthStr);
        const rawValue = row[columnIndex];
        
        // Get the cell directly from ExcelJS to access formatted text (which preserves negative sign)
        let cellText: string | null = null;
        try {
          const excelRow = worksheet.getRow(i + 1); // ExcelJS is 1-indexed
          const excelCell = excelRow.getCell(columnIndex + 1); // ExcelJS is 1-indexed
          // Try to get the formatted text value first (this preserves the visual format including negative sign)
          if (excelCell && excelCell.text !== undefined && excelCell.text !== null && excelCell.text !== '') {
            cellText = String(excelCell.text).trim();
          }
        } catch (e) {
          // If we can't read the cell, fall back to rawValue
        }
        
        // Parse value - handle numbers, strings, and ExcelJS objects
        let value: number | null = null;
        
        // Check for empty/null/undefined values
        if (rawValue === null || rawValue === undefined) {
          continue; // Skip empty values
        }
        
        // Check for empty strings (including whitespace-only)
        if (typeof rawValue === 'string' && rawValue.trim() === '') {
          continue; // Skip empty strings
        }
        
        // Priority 1: If rawValue is already a number (negative or positive), use it directly
        // This preserves the sign that ExcelJS already detected
        if (typeof rawValue === 'number' && !isNaN(rawValue) && isFinite(rawValue)) {
          value = rawValue; // Use the number directly, preserving sign
        } else {
          // Handle ExcelJS value objects and strings
          let processedValue: any = rawValue;
          let originalStringValue: string | null = null;
          
          // If we have cellText (formatted text from Excel), use it to preserve negative sign
          if (cellText !== null && cellText !== '') {
            originalStringValue = cellText;
            processedValue = cellText; // Process as string to detect negative sign
          } else if (typeof rawValue === 'object') {
            // ExcelJS can return objects - extract the actual value
            if ('result' in rawValue) {
              processedValue = rawValue.result;
              // If result is a number, use it directly
              if (typeof processedValue === 'number' && !isNaN(processedValue) && isFinite(processedValue)) {
                value = processedValue;
                continue; // Skip to next iteration
              }
            } else if ('text' in rawValue) {
              processedValue = rawValue.text;
              originalStringValue = String(rawValue.text);
            } else if ('value' in rawValue) {
              processedValue = rawValue.value;
              // If value is a number, use it directly
              if (typeof processedValue === 'number' && !isNaN(processedValue) && isFinite(processedValue)) {
                value = processedValue;
                continue; // Skip to next iteration
              }
            } else {
              // Try to convert the object to a number
              const numValue = Number(rawValue);
              if (!isNaN(numValue) && isFinite(numValue)) {
                value = numValue;
                continue; // Skip to next iteration
              }
              processedValue = String(rawValue);
              if (typeof processedValue === 'string') {
                originalStringValue = processedValue;
              }
            }
          } else if (typeof rawValue === 'string') {
            originalStringValue = rawValue;
          }
          
          // Process as string if we haven't set value yet
          if ((typeof processedValue === 'string' || originalStringValue !== null)) {
            // Use original string value if available, otherwise use processedValue
            const stringToProcess = originalStringValue || String(processedValue);
            let cleanedValue = stringToProcess.trim();
            
            // Check if the value contains "-" (negative sign) before any digits
            // This handles cases like: "-1234", "- 1234", "-$1234", etc.
            // Look for "-" at the start (possibly after spaces/currency symbols)
            // Also handle parentheses format used in accounting: "(1234.56)" means negative
            const hasLeadingNegative = /^[\s$€£¥]*-/.test(cleanedValue);
            const hasParenthesesFormat = /^\([^)]+\)$/.test(cleanedValue);
            const isNegative = hasLeadingNegative || hasParenthesesFormat;
            
            // Remove negative sign and any leading currency symbols/spaces temporarily for processing
            if (isNegative) {
              // Remove parentheses format first (e.g., "(1234.56)" -> "1234.56")
              if (hasParenthesesFormat) {
                cleanedValue = cleanedValue.replace(/^\(|\)$/g, '');
              }
              // Remove the negative sign and any leading symbols/spaces
              if (hasLeadingNegative) {
                cleanedValue = cleanedValue.replace(/^[\s$€£¥]*-/, '').trim();
              }
            }
            
            // Remove currency symbols (in case they appear elsewhere)
            cleanedValue = cleanedValue.replace(/[$€£¥]/g, '');
            
            // Remove spaces
            cleanedValue = cleanedValue.replace(/\s/g, '');
            
            // Check if it uses dot as thousands separator and comma as decimal (e.g., "1.234,56")
            // or comma as thousands and dot as decimal (e.g., "1,234.56")
            const hasDots = cleanedValue.includes('.');
            const hasCommas = cleanedValue.includes(',');
            
            if (hasDots && hasCommas) {
              // Determine which separator is used for thousands
              // The one that appears last is the decimal separator
              const lastDotIndex = cleanedValue.lastIndexOf('.');
              const lastCommaIndex = cleanedValue.lastIndexOf(',');
              
              if (lastDotIndex > lastCommaIndex) {
                // Format: "1,234.56" or "1,234,567.89" (comma=thousands, dot=decimal)
                // The dot is the decimal separator (appears last)
                // Remove all commas (thousands), keep dot as decimal
                cleanedValue = cleanedValue.replace(/,/g, '');
              } else {
                // Format: "1.234,56" or "1.234.567,89" (dot=thousands, comma=decimal)
                // The comma is the decimal separator (appears last)
                // Remove all dots (thousands) and replace comma with dot (decimal)
                cleanedValue = cleanedValue.replace(/\./g, '').replace(',', '.');
              }
            } else if (hasCommas && !hasDots) {
              // Only commas: could be decimal separator or thousands
              // If more than one comma, likely thousands separator
              const commaCount = (cleanedValue.match(/,/g) || []).length;
              if (commaCount > 1) {
                // Thousands separator: "1,234,567"
                cleanedValue = cleanedValue.replace(/,/g, '');
              } else {
                // Probably decimal separator: "1234,56"
                cleanedValue = cleanedValue.replace(',', '.');
              }
            } else if (hasDots && !hasCommas) {
              // Only dots: could be decimal separator or thousands
              // If more than one dot, likely thousands separator
              const dotCount = (cleanedValue.match(/\./g) || []).length;
              if (dotCount > 1) {
                // Thousands separator: "1.234.567"
                cleanedValue = cleanedValue.replace(/\./g, '');
              }
              // If single dot, assume decimal separator
            }
            
            const parsed = parseFloat(cleanedValue);
            if (!isNaN(parsed) && isFinite(parsed)) {
              // Apply negative sign if the original value started with "-" or was in parentheses
              value = isNegative ? -Math.abs(parsed) : parsed;
            }
          }
        }
        
        // Only process if we have a valid number (including zero, as zero might be a valid expense in some cases)
        // But skip if it's exactly zero to avoid noise
        if (value !== null && value !== 0) {
          try {
            // Create date for the first day of the month (only month and year, day always 1)
            // Use UTC to avoid timezone issues
            const date = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
            
            // Validate date
            if (isNaN(date.getTime())) {
              warnings.push({
                sheet: worksheet.name,
                row: i + 1,
                item: itemName,
                category: currentCategory,
                month: month,
                year: year,
                value: rawValue,
                reason: `Fecha inválida: mes ${month}, año ${year}`,
              });
              continue;
            }
            
            // Determine if this is income or expense based on category name
            // Only categories containing "ingreso" are considered income
            // "mesada" and all other categories are expenses
            const categoryLower = currentCategory.toLowerCase();
            const isIncome = categoryLower.includes('ingreso');
            const kind = isIncome ? 'income' : 'expense';
            
            // For income: use category name, and item name as concept
            // For expense: use category name, and item name as concept
            if (kind === 'income') {
              // Ingresos: categoria = grupo, concepto = item
              parsedRecords.push({
                kind: 'income',
                categoria: sanitizedCategory,
                concepto: sanitizedConcept,
                nombre: sanitizedConcept,
                nota: '',
                amount: value,
                date: date.toISOString(),
                currency: 'ARS',
              });
            } else {
              // Gastos: categoria = categoría, nombre = item, nota vacía (se ignoran paréntesis)
              parsedRecords.push({
                kind: 'expense',
                categoria: sanitizedCategory,
                concepto: sanitizedConcept,
                nombre: sanitizedConcept,
                nota: '',
                amount: value,
                date: date.toISOString(),
                currency: 'ARS',
              });
            }
          } catch (error) {
            errors.push({
              sheet: worksheet.name,
              row: i + 1,
              item: itemName,
              category: currentCategory,
              month: month,
              year: year,
              value: rawValue,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else if (rawValue !== '') {
          // Value exists but couldn't be parsed - add warning
          warnings.push({
            sheet: worksheet.name,
            row: i + 1,
            item: itemName,
            category: currentCategory,
            month: month,
            year: year,
            value: rawValue,
            reason: 'No se pudo convertir a número válido',
          });
        }
      }
    }

    return {
      records: parsedRecords,
      total: parsedRecords.length,
      errors,
      warnings,
    };
  }

  async extractTextFromPdf(file: Express.Multer.File): Promise<string> {
    try {
      // Importar pdf-parse con tipos
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(file.buffer);
      return data.text;
    } catch (error) {
      throw new BadRequestException(`Error al extraer texto del PDF: ${error.message}`);
    }
  }

  /**
   * Divide el texto del PDF en secciones basándose en el encabezado de tabla "FECHA DESCRIPCIÓN NRO. CUPÓN PESOS DÓLARES"
   * Usa el renglón anterior como título de la sección
   * Si no hay título, junta todos los gastos en una sección
   * Si una sección tiene más de 1000 caracteres, la divide en partes
   */
  divideIntoSections(text: string): Array<{ title: string; content: string; index: number }> {
    const sections: Array<{ title: string; content: string; index: number }> = [];
    
    // Cortar antes de "Legales y avisos"
    const legalMarkers = [
      'Legales y avisos',
      'LEGALES Y AVISOS',
      'Legales y Avisos',
      'legales y avisos',
      'LEGALES',
      'Legales',
      'Avisos Legales',
      'AVISOS LEGALES'
    ];

    let processedText = text;
    for (const marker of legalMarkers) {
      const index = processedText.indexOf(marker);
      if (index !== -1) {
        processedText = processedText.substring(0, index).trim();
        break;
      }
    }

    const lines = processedText.split('\n');
    const tableHeaderPattern = /^FECHA\s+DESCRIPCIÓN\s+NRO\.\s+CUPÓN\s+PESOS\s+DÓLARES$/i;
    let sectionIndex = 0;
    const MAX_SECTION_SIZE = 1000; // Máximo de caracteres por sección

    // Primero, identificar todas las tablas y sus títulos
    const tableSections: Array<{ title: string; startIndex: number; endIndex: number }> = [];
    let lastValidTitle = ''; // Guardar el último título válido encontrado

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Buscar el encabezado de la tabla
      if (tableHeaderPattern.test(line)) {
        // El título es el renglón anterior (si existe y no está vacío)
        let sectionTitle = '';
        if (i > 0) {
          // Buscar hacia atrás el primer renglón válido que no sea el encabezado
          for (let j = i - 1; j >= 0 && j >= i - 5; j--) { // Buscar hasta 5 líneas hacia atrás
            const prevLine = lines[j].trim();
            
            // Filtrar líneas inválidas
            if (prevLine.length === 0) continue;
            if (tableHeaderPattern.test(prevLine)) continue;
            if (/^[\d\s$.,-]+$/.test(prevLine)) continue; // Solo números y símbolos
            if (prevLine.match(/^Página \d+ de \d+$/i)) continue;
            if (prevLine.match(/^Sobre \(/i)) continue;
            if (prevLine.match(/^Banco BBVA/i)) continue;
            if (prevLine.match(/^Sobre \(\d+\)/i)) continue;
            
            // Filtrar caracteres corruptos o especiales (líneas con muchos caracteres no ASCII)
            const nonAsciiRatio = (prevLine.match(/[^\x00-\x7F]/g) || []).length / prevLine.length;
            if (nonAsciiRatio > 0.3 && !prevLine.match(/[áéíóúñÁÉÍÓÚÑ]/)) continue; // Permitir acentos pero no caracteres raros
            
            // Filtrar líneas que parezcan ser parte de una transacción (tienen fecha al principio)
            if (/^\d{2}-[A-Za-z]{3}-\d{2}/.test(prevLine)) continue;
            
            // Filtrar líneas muy cortas o muy largas que probablemente no sean títulos
            if (prevLine.length < 3 || prevLine.length > 150) continue;
            
            // Priorizar líneas que contengan "Consumos" seguido de un nombre
            if (prevLine.match(/^Consumos\s+[A-Za-z\s]+$/i)) {
              sectionTitle = prevLine;
              lastValidTitle = prevLine; // Guardar como último título válido
              break;
            }
            
            // Si no encontramos "Consumos", usar la primera línea válida que encontremos
            if (!sectionTitle) {
              sectionTitle = prevLine;
              lastValidTitle = prevLine; // Guardar como último título válido
            }
          }
        }
        
        // Si no encontramos título válido, usar el título de la sección anterior
        if (!sectionTitle || sectionTitle.length === 0) {
          if (lastValidTitle && lastValidTitle.length > 0) {
            sectionTitle = lastValidTitle;
          } else {
            sectionTitle = 'Transacciones'; // Solo si es la primera y no hay título previo
          }
        }

        // Encontrar el final de esta tabla
        let endIndex = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          
          // Si encontramos otro encabezado de tabla, detener
          if (tableHeaderPattern.test(nextLine)) {
            break;
          }
          
          // Si encontramos "TOTAL CONSUMOS", incluirla y luego detener
          if (nextLine.includes('TOTAL CONSUMOS')) {
            endIndex = j + 1;
            break;
          }
          
          // Si encontramos otras secciones conocidas, detener
          if (nextLine.includes('Impuestos, cargos e intereses') ||
              nextLine.includes('Sus pagos y ajustes realizados') ||
              nextLine.includes('DETALLE')) {
            break;
          }
          
          endIndex = j + 1;
        }

        tableSections.push({
          title: sectionTitle,
          startIndex: i,
          endIndex: endIndex,
        });
      }
    }

    // Si no se encontraron tablas, crear una única sección con todo el contenido
    if (tableSections.length === 0) {
      const allContent = processedText;
      // Dividir si es muy grande
      if (allContent.length > MAX_SECTION_SIZE) {
        const chunks = this.splitContentIntoChunks(allContent, MAX_SECTION_SIZE);
        chunks.forEach((chunk, idx) => {
          sections.push({
            title: `Contenido completo (Parte ${idx + 1})`,
            content: chunk,
            index: sectionIndex++,
          });
        });
      } else {
        sections.push({
          title: 'Contenido completo',
          content: allContent,
          index: sectionIndex++,
        });
      }
      return sections;
    }

    // Agrupar tablas sin título en una sola sección
    const groupedSections: Array<{ title: string; content: string }> = [];
    let currentGroup: { title: string; content: string[] } | null = null;

    for (const tableSection of tableSections) {
      const sectionContent = lines.slice(tableSection.startIndex, tableSection.endIndex).join('\n');
      
      if (!tableSection.title || tableSection.title === '') {
        // Si no hay título, agregar al grupo actual o crear uno nuevo
        if (!currentGroup) {
          currentGroup = {
            title: 'Transacciones sin categoría',
            content: [],
          };
        }
        currentGroup.content.push(sectionContent);
      } else {
        // Si hay título, guardar el grupo anterior (si existe) y crear nueva sección
        if (currentGroup) {
          groupedSections.push({
            title: currentGroup.title,
            content: currentGroup.content.join('\n\n'),
          });
          currentGroup = null;
        }
        groupedSections.push({
          title: tableSection.title,
          content: sectionContent,
        });
      }
    }

    // Guardar el último grupo si existe
    if (currentGroup) {
      groupedSections.push({
        title: currentGroup.title,
        content: currentGroup.content.join('\n\n'),
      });
    }

    // Dividir secciones grandes en chunks más pequeños
    for (const groupedSection of groupedSections) {
      if (groupedSection.content.length > MAX_SECTION_SIZE) {
        const chunks = this.splitContentIntoChunks(groupedSection.content, MAX_SECTION_SIZE);
        chunks.forEach((chunk, idx) => {
          sections.push({
            title: chunks.length > 1 
              ? `${groupedSection.title} (Parte ${idx + 1})` 
              : groupedSection.title,
            content: chunk,
            index: sectionIndex++,
          });
        });
      } else {
        sections.push({
          title: groupedSection.title,
          content: groupedSection.content,
          index: sectionIndex++,
        });
      }
    }

    return sections;
  }

  /**
   * Obtiene el tipo de cambio del dólar oficial (USD/ARS) desde múltiples fuentes
   * @returns El tipo de cambio como número, o null si falla
   */
  private async getOfficialDollarRate(): Promise<number | null> {
    try {
      // Intentar primero con DolarAPI (API pública argentina)
      try {
        const dolarApiResponse = await axios.get('https://api.bluelytics.com.ar/v2/latest', {
          timeout: 5000,
        });
        
        if (dolarApiResponse.data?.oficial?.value_sell) {
          const rate = dolarApiResponse.data.oficial.value_sell;
          if (rate && rate > 0) {
            return rate;
          }
        }
        if (dolarApiResponse.data?.oficial?.value_buy) {
          const rate = dolarApiResponse.data.oficial.value_buy;
          if (rate && rate > 0) {
            return rate;
          }
        }
      } catch (dolarApiError) {
        // Si DolarAPI falla, intentar con Yahoo Finance
      }

      // Intentar con Yahoo Finance (USDARS=X)
      try {
        const yahooResponse = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/USDARS=X', {
          timeout: 5000,
        });
        
        if (yahooResponse.data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
          const rate = yahooResponse.data.chart.result[0].meta.regularMarketPrice;
          if (rate && rate > 0) {
            return rate;
          }
        }
      } catch (yahooError) {
        // Si Yahoo Finance falla, intentar con CoinGecko
      }

      // Intentar con CoinGecko (usando el par USD/ARS)
      try {
        const coingeckoResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=usd&vs_currencies=ars', {
          timeout: 5000,
        });
        
        if (coingeckoResponse.data?.usd?.ars) {
          const rate = coingeckoResponse.data.usd.ars;
          if (rate && rate > 0) {
            return rate;
          }
        }
      } catch (coingeckoError) {
        // Si todos fallan, retornar null
      }

      // Si todas las APIs fallan, retornar null
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Divide el contenido en chunks más pequeños, intentando cortar en líneas completas
   */
  private splitContentIntoChunks(content: string, maxSize: number): string[] {
    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk: string[] = [];
    let currentSize = 0;

    for (const line of lines) {
      const lineSize = line.length + 1; // +1 por el \n

      if (currentSize + lineSize > maxSize && currentChunk.length > 0) {
        // Guardar el chunk actual y empezar uno nuevo
        chunks.push(currentChunk.join('\n'));
        currentChunk = [line];
        currentSize = lineSize;
      } else {
        currentChunk.push(line);
        currentSize += lineSize;
      }
    }

    // Agregar el último chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }

    return chunks.length > 0 ? chunks : [content];
  }

  /**
   * Normaliza un string para comparación (lowercase, sin acentos, sin espacios extra)
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .trim()
      .replace(/\s+/g, ' '); // Normalizar espacios
  }

  /**
   * Calcula similitud entre dos strings (0-1)
   */
  private stringSimilarity(str1: string, str2: string): number {
    const s1 = this.normalizeString(str1);
    const s2 = this.normalizeString(str2);
    
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Calcular similitud por palabras clave
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const commonWords = words1.filter(w => words2.includes(w));
    if (commonWords.length > 0) {
      return Math.max(commonWords.length / Math.max(words1.length, words2.length), 0.7);
    }
    
    return 0;
  }

  /**
   * Aplica mapeos de comercios conocidos a un registro
   * Busca en originalText si contiene alguno de los comercios mapeados
   */
  private async applyMerchantMapping(
    record: any,
    categoriesData: Array<{ id: string; name: string; type: string }>,
    conceptsData: { expenses: Array<{ concept: string; categoryId: string }>; income: Array<{ concept: string; categoryId: string }> }
  ): Promise<{ categoryId: string | null; concept: string | null; categoryName: string | null }> {
    const originalText = (record.originalText || '').toUpperCase();
    
    // Buscar coincidencia con algún comercio mapeado
    for (const mapping of this.MERCHANT_MAPPINGS) {
      const merchantUpper = mapping.merchant.toUpperCase();
      
      // Verificar si el texto original contiene el comercio (coincidencia parcial)
      if (originalText.includes(merchantUpper)) {
        // Buscar la categoría en categoriesData con búsqueda flexible
        const normalizedMappingCategory = this.normalizeString(mapping.categoryName);
        let category = categoriesData.find(cat => {
          const normalizedCatName = this.normalizeString(cat.name);
          return normalizedCatName === normalizedMappingCategory || 
                 normalizedCatName.includes(normalizedMappingCategory) ||
                 normalizedMappingCategory.includes(normalizedCatName);
        });
        
        // Si no se encontró con búsqueda exacta, buscar por similitud
        if (!category) {
          const categoryMatches = categoriesData.map(cat => ({
            category: cat,
            similarity: this.stringSimilarity(cat.name, mapping.categoryName)
          })).filter(m => m.similarity > 0.7)
            .sort((a, b) => b.similarity - a.similarity);
          
          if (categoryMatches.length > 0) {
            category = categoryMatches[0].category;
          }
        }
        
        if (!category) {
          const availableCategories = categoriesData.map(c => c.name).join(', ');
          console.warn(`Categoría "${mapping.categoryName}" no encontrada en la base de datos para comercio "${mapping.merchant}"`);
          console.warn(`Categorías disponibles: ${availableCategories}`);
          continue;
        }
        
        // Buscar el concepto en conceptsData (tanto expenses como income) con búsqueda flexible
        const allConcepts = [...conceptsData.expenses, ...conceptsData.income];
        const normalizedMappingConcept = this.normalizeString(mapping.concept);
        let concept = allConcepts.find(c => {
          const normalizedConceptName = this.normalizeString(c.concept);
          const matchesCategory = c.categoryId === category.id;
          const matchesConcept = normalizedConceptName === normalizedMappingConcept || 
                                 normalizedConceptName.includes(normalizedMappingConcept) ||
                                 normalizedMappingConcept.includes(normalizedConceptName);
          return matchesCategory && matchesConcept;
        });
        
        // Si no se encontró con búsqueda exacta, buscar por similitud dentro de la categoría
        if (!concept) {
          const conceptMatches = allConcepts
            .filter(c => c.categoryId === category.id)
            .map(c => ({
              concept: c,
              similarity: this.stringSimilarity(c.concept, mapping.concept)
            }))
            .filter(m => m.similarity > 0.7)
            .sort((a, b) => b.similarity - a.similarity);
          
          if (conceptMatches.length > 0) {
            concept = conceptMatches[0].concept;
          }
        }
        
        if (!concept) {
          const availableConcepts = allConcepts
            .filter(c => c.categoryId === category.id)
            .map(c => c.concept)
            .join(', ');
          console.warn(`Concepto "${mapping.concept}" no encontrado en categoría "${category.name}" para comercio "${mapping.merchant}"`);
          console.warn(`Conceptos disponibles en "${category.name}": ${availableConcepts || '(ninguno)'}`);
          continue;
        }
        
        // Retornar el mapeo encontrado
        return {
          categoryId: category.id,
          concept: concept.concept,
          categoryName: category.name,
        };
      }
    }
    
    // No se encontró mapeo
    return {
      categoryId: null,
      concept: null,
      categoryName: null,
    };
  }

  /**
   * Procesa un resumen mensual usando OpenAI para extraer transacciones.
   * 
   * OPTIMIZACIONES PARA REDUCIR COSTOS DE API:
   * - Usa modelo gpt-5-nano (más económico)
   * - Prompt compacto: solo nombres de conceptos/categorías, sin IDs ni datos redundantes
   * - Limita tokens de respuesta (max_tokens: 4000)
   * - Limita tamaño del texto procesado (máx 50KB)
   * - Temperatura reducida (0.2) para respuestas más consistentes
   * - Instrucciones simplificadas eliminando repeticiones
   */
  async processMonthlySummary(summary: string, selectedBank?: { categoryId: string; concept: string; categoryName: string }, sectionTitle?: string) {
    if (!summary || summary.trim().length === 0) {
      throw new BadRequestException('El resumen mensual no puede estar vacío');
    }
    
    // Si la sección es "Sus pagos y ajustes realizados", retornar vacío (no procesar)
    const paymentMarkers = [
      'Sus pagos y ajustes realizados',
      'SUS PAGOS Y AJUSTES REALIZADOS',
      'Sus Pagos y Ajustes Realizados',
      'sus pagos y ajustes realizados',
      'PAGOS Y AJUSTES',
      'Pagos y ajustes',
    ];
    
    if (sectionTitle) {
      const isPaymentSection = paymentMarkers.some(marker => 
        sectionTitle.toLowerCase().includes(marker.toLowerCase())
      );
      if (isPaymentSection) {
        return {
          records: [],
          unmappedItems: [],
          message: 'Sección "Sus pagos y ajustes realizados" ignorada según configuración.',
        };
      }
    }
    
    // Filtrar la sección "Sus pagos y ajustes realizados" del contenido si está presente
    let processedSummary = summary;
    for (const marker of paymentMarkers) {
      const index = processedSummary.indexOf(marker);
      if (index !== -1) {
        // Encontrar el final de esta sección (buscar la siguiente sección o el final del texto)
        const nextSectionMarkers = [
          'Impuestos, cargos e intereses',
          'IMPUESTOS, CARGOS E INTERESES',
          'Legales y avisos',
          'LEGALES Y AVISOS',
        ];
        
        let endIndex = processedSummary.length;
        for (const nextMarker of nextSectionMarkers) {
          const nextIndex = processedSummary.indexOf(nextMarker, index + marker.length);
          if (nextIndex !== -1 && nextIndex < endIndex) {
            endIndex = nextIndex;
          }
        }
        
        // Eliminar la sección completa
        processedSummary = processedSummary.substring(0, index).trim() + '\n' + processedSummary.substring(endIndex).trim();
        break;
      }
    }

    // Cortar el resumen antes de "Legales y avisos" o variaciones
    const legalMarkers = [
      'Legales y avisos',
      'LEGALES Y AVISOS',
      'Legales y Avisos',
      'legales y avisos',
      'LEGALES',
      'Legales',
      'Avisos Legales',
      'AVISOS LEGALES'
    ];

    for (const marker of legalMarkers) {
      const index = processedSummary.indexOf(marker);
      if (index !== -1) {
        processedSummary = processedSummary.substring(0, index).trim();
        break;
      }
    }
    
    // Detectar si la sección es "Impuestos, cargos e intereses" y si hay banco seleccionado
    const isTaxesSection = sectionTitle && (
      sectionTitle.toLowerCase().includes('impuestos') ||
      sectionTitle.toLowerCase().includes('cargos') ||
      sectionTitle.toLowerCase().includes('intereses')
    );

    if (processedSummary.length === 0) {
      throw new BadRequestException('El resumen mensual no contiene información válida después de filtrar secciones legales');
    }

    // Limitar el tamaño del texto para reducir costos de API (máximo 50KB de texto)
    const MAX_SUMMARY_SIZE = 50000;
    if (processedSummary.length > MAX_SUMMARY_SIZE) {
      console.warn(`[WARNING] El resumen es muy grande (${processedSummary.length} caracteres). Se truncará a ${MAX_SUMMARY_SIZE} caracteres para reducir costos.`);
      processedSummary = processedSummary.substring(0, MAX_SUMMARY_SIZE) + '\n[... texto truncado ...]';
    }

    // Verificar que existe la API key de OpenAI
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new BadRequestException('OPENAI_API_KEY no está configurada en las variables de entorno. Por favor, configura OPENAI_API_KEY en tu archivo .env o variables de entorno.');
    }

    // Obtener todas las categorías y conceptos existentes de la base de datos
    const categories = await this.prisma.category.findMany({
      include: {
        type: true,
      },
      orderBy: { name: 'asc' },
    });

    // Obtener conceptos únicos de expenses e income
    const expenses = await this.prisma.expense.findMany({
      select: { concept: true, categoryId: true },
      distinct: ['concept'],
    });

    const income = await this.prisma.income.findMany({
      select: { concept: true, categoryId: true },
      distinct: ['concept'],
    });

    // Construir estructura de datos compacta para el prompt (solo conceptos únicos)
    const categoriesMap = new Map<string, { id: string; name: string; type: string }>();
    categories.forEach(cat => {
      categoriesMap.set(cat.name.toLowerCase(), {
        id: cat.id,
        name: cat.name,
        type: cat.type.name,
      });
    });

    // Crear un mapa de conceptos por nombre (más compacto)
    const conceptsMap = new Map<string, { concept: string; categoryId: string; categoryName: string }>();
    [...expenses, ...income].forEach(item => {
      const category = categories.find(c => c.id === item.categoryId);
      if (category) {
        const key = item.concept.toLowerCase();
        if (!conceptsMap.has(key)) {
          conceptsMap.set(key, {
            concept: item.concept,
            categoryId: item.categoryId,
            categoryName: category.name,
          });
        }
      }
    });

    // Formato compacto: solo nombres de categorías y conceptos (sin IDs en el prompt principal)
    const categoryNames = Array.from(categoriesMap.values()).map(c => c.name).sort();
    const conceptNames = Array.from(conceptsMap.values()).map(c => c.concept).sort();

    // Preparar mapeos de comercios para el prompt (formato compacto)
    const merchantMappingsText = this.MERCHANT_MAPPINGS.map(m => 
      `"${m.merchant}" -> ${m.categoryName}/${m.concept}`
    ).join(', ');

    // Contar líneas con fecha antes de crear el prompt
    const estimatedLinesBefore = processedSummary.split('\n').filter(line => {
      const trimmed = line.trim();
      return /^\d{2}-[A-Za-z]{3}-\d{2}/.test(trimmed) && 
             !trimmed.includes('TOTAL CONSUMOS') && 
             !trimmed.includes('SALDO ACTUAL') && 
             !trimmed.includes('SALDO ANTERIOR') &&
             !trimmed.includes('SUBTOTAL');
    }).length;

    // Prompt optimizado y más corto
    const prompt = `Extract ALL transactions from this financial summary. Process ${estimatedLinesBefore} transactions.

RULES:
- Process lines starting with DD-MMM-YY date format
- Ignore: "TOTAL CONSUMOS", "SALDO ACTUAL", "SALDO ANTERIOR", "SUBTOTAL", headers
- Extract: date (convert to YYYY-MM-DD), concept (remove MERCADOPAGO prefix, remove trailing numbers), amount (normalize: remove thousands separators, use dot as decimal), currency (USD if DÓLARES column has value, else ARS)
- Clean concept: remove "MERCADOPAGO"/"MERPAGO", remove trailing numbers/codes, remove asterisks

MERCHANT MAPPINGS (use exact match):
${merchantMappingsText}

AVAILABLE CONCEPTS (must use exact names from this list):
${conceptNames.join(', ')}

CATEGORIES:
${categoryNames.join(', ')}

MAPPING:
1. Check merchant mappings first (HIGH priority)
2. Match concept from AVAILABLE CONCEPTS list (exact > partial > fuzzy)
3. Set mappingStatus: "ready" (high confidence), "needs_confirmation" (medium/low), "needs_mapping" (only if impossible)
4. ALWAYS assign a concept if possible (use "needs_confirmation" rather than "needs_mapping")

RESPONSE (JSON only):
{
  "records": [{
    "kind": "expense"|"income",
    "categoryId": "uuid"|null,
    "categoryName": "string"|null,
    "concept": "exact-concept-name-from-list"|null,
    "amount": number,
    "date": "YYYY-MM-DD",
    "currency": "ARS"|"USD",
    "mappingStatus": "ready"|"needs_confirmation"|"needs_mapping",
    "originalText": "concept-text-only-no-date-no-amount",
    "suggestedConcept": "string"|null
  }]
}

SUMMARY:
${processedSummary}`;

    try {
      const openai = new OpenAI({
        apiKey: openaiApiKey,
      });

      // Usar modelo GPT-5 nano (más económico)
      const completion = await openai.chat.completions.create({
        model: 'gpt-5-nano', // Modelo GPT-5 nano
        messages: [
          {
            role: 'system',
            content: 'You are an expert assistant analyzing financial summaries. Respond ONLY with valid JSON. Always try to assign an existing concept from the provided list. Use mappingStatus: "ready" (high confidence), "needs_confirmation" (medium/low), "needs_mapping" (only if impossible).',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2, // Reducido de 0.3 para respuestas más consistentes
        max_tokens: 4000, // Limitar tokens de respuesta para reducir costos
        response_format: { type: 'json_object' }
      });

      if (completion.choices[0]?.finish_reason === 'length') {
        console.warn('[WARNING] La respuesta fue truncada por límite de tokens. Puede que falten registros.');
      }

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        // Exception intentionally thrown to be caught by outer catch block
        throw new BadRequestException('No se recibió respuesta de OpenAI');
      }

      // Parsear la respuesta JSON
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseContent);
      } catch (parseError) {
        // Intentar extraer JSON si hay texto adicional
        const jsonMatch = responseContent.match(/\{[\s\S]*}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          // Exception intentionally thrown to be caught by outer catch block
          throw new BadRequestException('La respuesta de OpenAI no es un JSON válido');
        }
      }

      // Validar estructura de respuesta
      if (!parsedResponse.records || !Array.isArray(parsedResponse.records)) {
        // Exception intentionally thrown to be caught by outer catch block
        throw new BadRequestException('La respuesta de OpenAI no tiene el formato esperado');
      }

      // Obtener el tipo de cambio del dólar oficial
      const dollarRate = await this.getOfficialDollarRate();
      if (!dollarRate) {
        console.warn('No se pudo obtener el tipo de cambio del dólar oficial. Los montos en USD no se convertirán automáticamente.');
      }

      // Convertir categoriesData y conceptsData a arrays para compatibilidad con applyMerchantMapping
      const categoriesData = Array.from(categoriesMap.values());
      const conceptsData = {
        expenses: expenses.map(e => ({
          concept: e.concept,
          categoryId: e.categoryId,
        })),
        income: income.map(i => ({
          concept: i.concept,
          categoryId: i.categoryId,
        })),
      };

      // Asegurar que todos los registros tengan los campos requeridos y convertir USD a ARS
      const validatedRecords = await Promise.all(parsedResponse.records.map(async (record: any) => {
        let amount = record.amount || 0;
        let currency = (record.currency || 'ARS').toUpperCase();
        const originalCurrency = currency;
        
        // Si la moneda es USD y tenemos el tipo de cambio, convertir a ARS
        if (currency === 'USD' && dollarRate && dollarRate > 0) {
          amount = amount * dollarRate;
          currency = 'ARS';
        }
        
        // Mapear nombres a IDs si OpenAI solo devolvió nombres
        let categoryId = record.categoryId || null;
        let categoryName = record.categoryName || null;
        let conceptValue = record.concept || null;
        
        // Si tenemos categoryName pero no categoryId, buscar el ID
        if (categoryName && !categoryId) {
          const category = categoriesMap.get(categoryName.toLowerCase());
          if (category) {
            categoryId = category.id;
          }
        }
        
        // Si tenemos conceptValue pero no categoryId, buscar en conceptsMap
        if (conceptValue && !categoryId) {
          const conceptInfo = conceptsMap.get(conceptValue.toLowerCase());
          if (conceptInfo) {
            categoryId = conceptInfo.categoryId;
            categoryName = conceptInfo.categoryName;
          }
        }
        
        // Aplicar mapeo de comercios conocidos (tiene prioridad sobre el mapeo de OpenAI)
        const merchantMapping = await this.applyMerchantMapping(record, categoriesData, conceptsData);
        
        // Determinar mappingStatus (compatibilidad hacia atrás con needsManualMapping)
        let mappingStatus: 'ready' | 'needs_confirmation' | 'needs_mapping';
        if (record.mappingStatus) {
          mappingStatus = record.mappingStatus;
        } else if (record.needsManualMapping !== undefined) {
          // Compatibilidad hacia atrás: convertir needsManualMapping a mappingStatus
          mappingStatus = record.needsManualMapping ? 'needs_mapping' : 'ready';
        } else {
          // Si no viene ninguno, determinar basado en si tiene categoryId y concept
          mappingStatus = (!categoryId || !conceptValue) ? 'needs_mapping' : 'needs_confirmation';
        }
        
        if (merchantMapping.categoryId && merchantMapping.concept) {
          // Aplicar el mapeo del comercio (alta confianza)
          categoryId = merchantMapping.categoryId;
          conceptValue = merchantMapping.concept;
          categoryName = merchantMapping.categoryName;
          mappingStatus = 'ready';
        } else if (isTaxesSection && selectedBank && selectedBank.categoryId && selectedBank.concept) {
          // Si es la sección de impuestos y hay banco seleccionado, asignar al banco (alta confianza)
          categoryId = selectedBank.categoryId;
          conceptValue = selectedBank.concept;
          categoryName = selectedBank.categoryName;
          mappingStatus = 'ready';
        } else if (mappingStatus === 'needs_mapping' && conceptValue) {
          // Si tiene concepto pero está marcado como needs_mapping, cambiar a needs_confirmation
          mappingStatus = 'needs_confirmation';
        } else if (mappingStatus === 'needs_mapping' && !conceptValue) {
          // Si realmente no tiene concepto, mantener needs_mapping
          conceptValue = null;
        }
        
        // Clean originalText to remove date and amount if they are present
        let cleanedOriginalText = record.originalText || '';
        if (cleanedOriginalText) {
          // Remove date pattern (DD-MMM-YY or DD-MMM-YYYY at the beginning)
          cleanedOriginalText = cleanedOriginalText.replace(/^\d{2}-[A-Za-z]{3}-\d{2,4}\s*/i, '');
          // Remove amount patterns (numbers with dots, commas, spaces at the end)
          cleanedOriginalText = cleanedOriginalText.replace(/\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*$/, '');
          // Remove trailing/leading whitespace
          cleanedOriginalText = cleanedOriginalText.trim();
        }
        
        return {
          kind: record.kind || 'expense',
          categoryId: categoryId,
          categoryName: categoryName,
          concept: conceptValue,
          amount: amount,
          date: record.date || null,
          note: record.note || (originalCurrency === 'USD' && dollarRate ? `Convertido de USD a ARS (tipo de cambio: ${dollarRate.toFixed(2)})` : ''),
          currency: currency,
          mappingStatus: mappingStatus,
          originalText: cleanedOriginalText || JSON.stringify(record),
          originalCurrency: originalCurrency === 'USD' ? 'USD' : undefined, // Guardar la moneda original si era USD
          suggestedConcept: record.suggestedConcept || null, // Include suggested concept if provided
          isTaxesSection: isTaxesSection && selectedBank && selectedBank.categoryId && selectedBank.concept ? true : false, // Marcar registros de impuestos
        };
      }));

      // Combinar unmappedItems con records si existen (para compatibilidad)
      const allRecords = [...validatedRecords];
      if (parsedResponse.unmappedItems && Array.isArray(parsedResponse.unmappedItems)) {
        parsedResponse.unmappedItems.forEach((item: any) => {
          // Verificar que no esté ya en records
          const exists = allRecords.some(r => r.originalText === item.originalText);
          if (!exists) {
            // Clean originalText to remove date and amount if they are present
            let cleanedUnmappedText = item.originalText || '';
            if (cleanedUnmappedText) {
              // Remove date pattern (DD-MMM-YY or DD-MMM-YYYY at the beginning)
              cleanedUnmappedText = cleanedUnmappedText.replace(/^\d{2}-[A-Za-z]{3}-\d{2,4}\s*/i, '');
              // Remove amount patterns (numbers with dots, commas, spaces at the end)
              cleanedUnmappedText = cleanedUnmappedText.replace(/\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*$/, '');
              // Remove trailing/leading whitespace
              cleanedUnmappedText = cleanedUnmappedText.trim();
            }
            
            allRecords.push({
              kind: item.kind || 'expense',
              categoryId: null,
              categoryName: item.suggestedCategory || null,
              concept: null, // Always null for unmapped items - they need manual mapping
              amount: item.amount || 0,
              date: item.date || null,
              note: '',
              currency: 'ARS',
              mappingStatus: 'needs_mapping' as const,
              originalText: cleanedUnmappedText || JSON.stringify(item),
              suggestedConcept: item.suggestedConcept || null, // Include suggested concept
            });
          }
        });
      }

      // Separar registros de impuestos de los normales
      const taxesRecords = allRecords.filter((r: any) => r.isTaxesSection === true);
      const normalRecords = allRecords.filter((r: any) => !(r as any).isTaxesSection);
      
      // Si hay registros de impuestos y banco seleccionado, consolidarlos en un solo registro
      let consolidatedTaxesRecord = null;
      if (taxesRecords.length > 0 && selectedBank && selectedBank.categoryId && selectedBank.concept) {
        const totalTaxesAmount = taxesRecords.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
        const taxesDates = taxesRecords.map((r: any) => r.date).filter(Boolean);
        const earliestDate = taxesDates.length > 0 ? taxesDates.sort()[0] : null;
        
        // Buscar la categoría "mantenimiento bancos" o "mantenimiento banco"
        const bankMaintenanceCategory = categoriesMap.get('mantenimiento bancos') || 
                                        categoriesMap.get('mantenimiento banco') ||
                                        null;
        
        consolidatedTaxesRecord = {
          kind: 'expense',
          categoryId: bankMaintenanceCategory?.id || selectedBank.categoryId,
          categoryName: bankMaintenanceCategory?.name || selectedBank.categoryName,
          concept: selectedBank.concept,
          amount: totalTaxesAmount,
          date: earliestDate || null,
          note: `Impuestos, cargos e intereses consolidados (${taxesRecords.length} registros)`,
          currency: 'ARS',
          mappingStatus: 'ready' as const,
          originalText: `Impuestos, cargos e intereses - ${taxesRecords.length} registros`,
          originalCurrency: undefined,
          suggestedConcept: null,
          isTaxesSection: true,
        };
      }
      
      // Combinar registros normales con el registro consolidado de impuestos (si existe)
      const sortedRecords = [...normalRecords];
      if (consolidatedTaxesRecord) {
        sortedRecords.push(consolidatedTaxesRecord);
      } else if (taxesRecords.length > 0) {
        // Si no se pudo consolidar pero hay registros de impuestos, agregarlos al final
        sortedRecords.push(...taxesRecords);
      }

      const readyCount = sortedRecords.filter(r => r.mappingStatus === 'ready').length;
      const needsConfirmationCount = sortedRecords.filter(r => r.mappingStatus === 'needs_confirmation').length;
      const needsMappingCount = sortedRecords.filter(r => r.mappingStatus === 'needs_mapping').length;

      return {
        records: sortedRecords,
        unmappedItems: [], // Ya están incluidos en records
        message: `Se procesaron ${sortedRecords.length} registros. ${readyCount} listos, ${needsConfirmationCount} necesitan confirmación, ${needsMappingCount} necesitan mapeo.`,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error procesando resumen mensual con OpenAI:', error);
      throw new BadRequestException(`Error al procesar el resumen: ${error.message}`);
    }
  }

  async deleteAllExpensesAndIncome() {
    try {
      // Eliminar todos los gastos e ingresos
      const deletedExpenses = await this.prisma.expense.deleteMany({});
      const deletedIncome = await this.prisma.income.deleteMany({});
      
      return {
        message: 'Todos los datos eliminados exitosamente',
        deletedExpenses: deletedExpenses.count,
        deletedIncome: deletedIncome.count,
      };
    } catch (error) {
      console.error('Error eliminando todos los datos:', error);
      throw new BadRequestException(`Error al eliminar los datos: ${error.message}`);
    }
  }
}

