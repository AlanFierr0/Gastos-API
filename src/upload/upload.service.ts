import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { normalizeCategoryName } from '../common/utils/category.util';
import type { Express } from 'express';

@Injectable()
export class UploadService {
  private readonly MAX_ROWS = 10000; // Limit to prevent DoS
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  

  constructor(private prisma: PrismaService) {}
  

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

  async saveParsedRecords(records: any[], parseErrors: any[] = [], parseWarnings: any[] = []) {
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

          const expenseData = {
            categoryId: category.id,
            concept: conceptName,
            amount: record.amount,
            date: normalizedDate,
            note: notesValue || null,
            currency: record.currency,
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
}

