import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import { CreateRecordDto } from './dto/create-record.dto';

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

    // Process and save records with validation
    const savedRecords = [];
    for (const row of data) {
      // Sanitize and validate input
      const concepto = this.sanitizeString(row['concepto'] || row['Concepto']);
      const monto = this.parseNumber(row['monto'] || row['Monto']);
      const fecha = this.parseDate(row['fecha'] || row['Fecha']);

      if (!concepto || monto === null || !fecha) {
        continue; // Skip invalid rows
      }

      const record = await this.prisma.record.create({
        data: {
          concepto,
          monto,
          fecha,
          categoria: this.sanitizeString(row['categoria'] || row['Categoria']) || null,
          descripcion: this.sanitizeString(row['descripcion'] || row['Descripcion']) || null,
        },
      });
      savedRecords.push(record);
    }

    return {
      success: true,
      message: `${savedRecords.length} records imported successfully`,
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
