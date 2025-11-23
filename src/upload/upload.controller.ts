import { 
  Controller, 
  Post, 
  Body,
  UploadedFile, 
  UseInterceptors,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { ApiConsumes, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonthlySummaryDto } from './dto/monthly-summary.dto';
import type { Express } from 'express';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('preview')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(xlsx|xls)$/)) {
          return callback(new BadRequestException('Only Excel files are allowed'), false);
        }
        callback(null, true);
      },
    })
  )
  async previewExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.uploadService.parseExcel(file);
  }

  @Post('confirm')
  async confirmImport(@Body() body: { records: any[]; errors?: any[]; warnings?: any[]; expenseTypeMap?: Record<string, string> }) {
    if (!body.records || !Array.isArray(body.records)) {
      throw new BadRequestException('Records array is required');
    }

    return this.uploadService.saveParsedRecords(body.records, body.errors || [], body.warnings || [], body.expenseTypeMap || {});
  }

  @Post('excel')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(xlsx|xls)$/)) {
          return callback(new BadRequestException('Only Excel files are allowed'), false);
        }
        callback(null, true);
      },
    })
  )
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.uploadService.parseAndSaveExcel(file);
  }

  @Post('monthly-summary')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Cargar resumen mensual (texto o PDF)' })
  @ApiResponse({ status: 200, description: 'Resumen mensual cargado exitosamente' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, callback) => {
        if (file) {
          if (!file.originalname.match(/\.(pdf)$/i)) {
            return callback(new BadRequestException('Solo se permiten archivos PDF'), false);
          }
        }
        callback(null, true);
      },
    })
  )
  async loadMonthlySummary(
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: MonthlySummaryDto | { summary?: string }
  ) {
    let summaryText: string;

    if (file) {
      // Si hay archivo PDF, extraer el texto
      summaryText = await this.uploadService.extractTextFromPdf(file);
    } else if (body && 'summary' in body && body.summary) {
      // Si hay texto en el body, usarlo directamente
      summaryText = body.summary;
    } else {
      throw new BadRequestException('Debe proporcionar un archivo PDF o texto del resumen mensual');
    }

    return this.uploadService.processMonthlySummary(summaryText);
  }

  @Post('monthly-summary/sections')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Obtener secciones del PDF para procesamiento por partes' })
  @ApiResponse({ status: 200, description: 'Secciones del PDF identificadas' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, callback) => {
        if (file) {
          if (!file.originalname.match(/\.(pdf)$/i)) {
            return callback(new BadRequestException('Solo se permiten archivos PDF'), false);
          }
        }
        callback(null, true);
      },
    })
  )
  async getMonthlySummarySections(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Debe proporcionar un archivo PDF');
    }

    const summaryText = await this.uploadService.extractTextFromPdf(file);
    const sections = this.uploadService.divideIntoSections(summaryText);

    return {
      sections: sections.map(s => ({
        index: s.index,
        title: s.title,
        content: s.content, // Devolver contenido completo
        contentLength: s.content.length,
        preview: s.content.substring(0, 300) + (s.content.length > 300 ? '...' : ''),
      })),
      totalSections: sections.length,
    };
  }

  @Post('monthly-summary/process-section')
  @ApiOperation({ summary: 'Procesar una sección específica del resumen mensual' })
  @ApiResponse({ status: 200, description: 'Sección procesada exitosamente' })
  async processMonthlySummarySection(@Body() body: { sectionContent: string; sectionTitle?: string }) {
    if (!body.sectionContent || body.sectionContent.trim().length === 0) {
      throw new BadRequestException('El contenido de la sección no puede estar vacío');
    }

    try {
      return await this.uploadService.processMonthlySummary(body.sectionContent);
    } catch (error) {
      // Devolver información detallada del error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = {
        success: false,
        error: errorMessage,
        errorType: error instanceof BadRequestException ? 'BadRequest' : 'InternalError',
        sectionTitle: body.sectionTitle || 'Sin título',
        timestamp: new Date().toISOString(),
      };
      
      // Si es un BadRequestException, lanzarlo con los detalles
      if (error instanceof BadRequestException) {
        throw new BadRequestException(JSON.stringify(errorDetails));
      }
      
      // Para otros errores, lanzar BadRequestException con detalles
      throw new BadRequestException(JSON.stringify(errorDetails));
    }
  }
}
