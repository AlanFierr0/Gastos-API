import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import { CreateRecordDto } from './dto/create-record.dto';

@Injectable()
export class UploadService {
  constructor(private prisma: PrismaService) {}

  async parseAndSaveExcel(file: Express.Multer.File) {
    // Parse Excel file
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Process and save records
    const savedRecords = [];
    for (const row of data) {
      const record = await this.prisma.record.create({
        data: {
          concepto: String(row['concepto'] || row['Concepto'] || ''),
          monto: Number(row['monto'] || row['Monto'] || 0),
          fecha: new Date(row['fecha'] || row['Fecha'] || new Date()),
          categoria: row['categoria'] || row['Categoria'] || null,
          descripcion: row['descripcion'] || row['Descripcion'] || null,
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
}
