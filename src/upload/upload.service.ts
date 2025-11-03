import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

@Injectable()
export class UploadService {
  private readonly MAX_ROWS = 10000; // Limit to prevent DoS
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  constructor(private prisma: PrismaService) {}

  async parseAndSaveExcel(file: Express.Multer.File) {
    // Security: Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    // Parse Excel file with safety options
    const workbook = XLSX.read(file.buffer, { 
      type: 'buffer',
      cellStyles: false, // Don't parse styles to reduce attack surface
      cellHTML: false,   // Don't parse HTML
      cellFormula: false, // Don't parse formulas
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Excel file contains no sheets');
    }

    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Security: Limit number of rows
    if (data.length > this.MAX_ROWS) {
      throw new BadRequestException(`File contains too many rows. Maximum is ${this.MAX_ROWS}`);
    }

    if (data.length === 0) {
      throw new BadRequestException('Excel file is empty');
    }

    // Validate minimal columns
    const first = data[0] as any;
    const hasAmount = first && (first['amount'] !== undefined || first['monto'] !== undefined || first['Monto'] !== undefined);
    const hasDate = first && (first['date'] !== undefined || first['fecha'] !== undefined || first['Fecha'] !== undefined);
    if (!hasAmount || !hasDate) {
      throw new BadRequestException('Excel must contain at least amount and date columns');
    }

    // Process and save rows as expenses or incomes
    const savedRecords = [] as any[];
    for (const row of data) {
      const type = (this.sanitizeString(row['type'] || row['Type']) || '').toLowerCase();
      const amount = this.parseNumber(row['amount'] || row['monto'] || row['Monto']);
      const date = this.parseDate(row['date'] || row['fecha'] || row['Fecha']);
      const notes = this.sanitizeString(row['notes'] || row['descripcion'] || row['Descripcion']);

      if (amount === null || !date) continue;

      const currency = (this.sanitizeString(row['currency'] || row['Currency']) || 'USD').toUpperCase();
      if (type === 'income' || row['source'] || row['Source']) {
        const source = this.sanitizeString(row['source'] || row['Source'] || 'Income') || 'Income';
        const created = await this.prisma.income.create({
          data: { source, amount, date, notes: notes || undefined, currency },
        });
        savedRecords.push({ kind: 'income', ...created });
      } else {
        const categoryName = this.sanitizeString(row['category'] || row['Category'] || row['categoria'] || row['Categoria']) || 'Uncategorized';
        const typeRow = await this.prisma.categoryType.upsert({ where: { name: 'expense' }, update: {}, create: { name: 'expense' } });
        const existingCategory = await this.prisma.category.findFirst({ where: { name: categoryName } });
        const category = existingCategory || (await this.prisma.category.create({ data: { name: categoryName, typeId: typeRow.id } }));
        const personName = this.sanitizeString(row['person'] || row['Person']);
        let personId: string | undefined = undefined;
        if (personName) {
          const person = await this.prisma.person.upsert({ where: { name: personName }, update: {}, create: { name: personName } });
          personId = person.id;
        }
        const created = await this.prisma.expense.create({
          data: { categoryId: category.id, personId, amount, date, notes: notes || undefined, currency },
          include: { category: true },
        });
        savedRecords.push({ kind: 'expense', ...created });
      }
    }

    return {
      success: true,
      message: `${savedRecords.length} rows imported successfully`,
      records: savedRecords,
    };
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
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }
}
