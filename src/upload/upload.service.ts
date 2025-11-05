import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

@Injectable()
export class UploadService {
  private readonly MAX_ROWS = 10000; // Limit to prevent DoS
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly logger = new Logger(UploadService.name);

  constructor(private prisma: PrismaService) {}

  async createPersons(personNames: string[]) {
    this.logger.log(`=== CREANDO ${personNames.length} PERSONAS ===`);
    const createdPersons = [];
    
    for (const personName of personNames) {
      const person = await this.prisma.person.upsert({
        where: { name: personName },
        update: {},
        create: { name: personName }
      });
      createdPersons.push(person);
      this.logger.log(`Persona "${personName}" creada/encontrada (ID: ${person.id})`);
    }

    return {
      success: true,
      message: `${createdPersons.length} personas procesadas`,
      persons: createdPersons,
    };
  }

  // (removed unused helper methods: findHeaderRowIndex, findMonthColumns, findSectionStart)

  private isSectionHeader(firstCell: string): boolean {
    const cellLower = firstCell.toLowerCase().trim();
    const sectionKeywords = ['alimentos', 'servicios', 'mantenimiento', 'transporte', 'salud', 
                            'educacion', 'entretenimiento', 'vacaciones', 'inversiones', 'ingresos',
                            'supermercado', 'expensas', 'luz', 'gas', 'internet', 'spotify',
                            'netflix', 'hbo', 'directtv', 'seguro', 'nafta', 'patente', 'garage',
                            'universidad', 'banco', 'galicia', 'frances', 'mercado', 'pago',
                            'efectivo', 'dolares', 'pesos', 'intereses', 'ahorro', 'mes anterior',
                            'vestimenta', 'regalos', 'salidas', 'cumples', 'deportes', 'salud',
                            'conceptos', 'total', 'mesada'];
    
    return sectionKeywords.some(keyword => cellLower === keyword || cellLower.startsWith(keyword + ' '));
  }

  private isValidPersonName(name: string): boolean {
    if (!name || name.trim() === '') return false;
    
    const nameLower = name.toLowerCase().trim();
    
    // Exclude currency abbreviations and symbols
    const currencyPatterns = ['u$d', 'usd', 'eur', 'ars', 'brl', 'mxn', 'clp', 'uyu', 
                              'u$s', 'dolares', 'dólares', 'pesos', 'euros', 'reales'];
    if (currencyPatterns.some(pattern => nameLower === pattern || nameLower.includes(pattern))) {
      return false;
    }
    
    // Exclude common abbreviations and symbols
    const invalidPatterns = ['$', '€', '£', '¥', 'u$', 'us$', 'total', 'subtotal', 
                             'conceptos', 'mes', 'meses', 'año', 'años'];
    if (invalidPatterns.some(pattern => nameLower.includes(pattern))) {
      return false;
    }
    
    // Exclude if it's too short (likely abbreviation) or too long (likely description)
    if (name.length < 2 || name.length > 50) {
      return false;
    }
    
    // Exclude if it contains mostly numbers or special characters
    const alphanumericRatio = (name.match(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/g) || []).length / name.length;
    if (alphanumericRatio < 0.5) {
      return false;
    }
    
    // Exclude if it's mostly numbers
    return !/^\d+$/.test(name.replace(/\s/g, ''));
  }

  // (removed unused heuristic methods for person name detection)

  async parseExcel(file: Express.Multer.File) {
    this.logger.log(`=== INICIANDO PARSEO DE ARCHIVO: ${file.originalname} ===`);
    this.logger.log(`Tamaño del archivo: ${file.size} bytes`);
    
    // Security: Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      this.logger.error(`Archivo excede el límite de tamaño: ${file.size} bytes`);
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    // Parse Excel file with cell styles to detect bold formatting
    const workbook = XLSX.read(file.buffer, { 
      type: 'buffer',
      cellStyles: true,
      cellHTML: false,
      cellFormula: false,
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      this.logger.error('El archivo Excel no contiene hojas');
      throw new BadRequestException('Excel file contains no sheets');
    }

    this.logger.log(`Hoja encontrada: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to array format to check for "Planilla gastos" format
    const arrayData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
    this.logger.log(`Total de filas en arrayData: ${arrayData.length}`);
    this.logger.log(`Primeras 5 filas del arrayData:`);
    for (let i = 0; i < Math.min(5, arrayData.length); i++) {
      const row = arrayData[i] as any[];
      this.logger.log(`  Fila ${i}: ${JSON.stringify(row?.slice(0, 5))}`);
    }
    
    // Security: Limit number of rows
    if (arrayData.length > this.MAX_ROWS) {
      this.logger.error(`Archivo tiene demasiadas filas: ${arrayData.length}`);
      throw new BadRequestException(`File contains too many rows. Maximum is ${this.MAX_ROWS}`);
    }

    if (arrayData.length === 0) {
      this.logger.error('El archivo está vacío después del parseo');
      throw new BadRequestException('Excel file is empty');
    }
    
    // Check if this is the "Planilla gastos" format (conceptos + meses)
    this.logger.log('=== INICIANDO DETECCIÓN DE FORMATO PLANILLA ===');
    const isPlanillaFormat = this.detectPlanillaFormat(arrayData);
    this.logger.log(`¿Formato Planilla detectado? ${isPlanillaFormat}`);
    
    if (isPlanillaFormat) {
      this.logger.log('Formato Planilla detectado. Iniciando parseo...');
      try {
        const result = await this.parsePlanillaFormat(arrayData, worksheet);
        this.logger.log(`✅ Parseo Planilla exitoso. Total de registros: ${result.total}`);
        // Even if no records found, return the result (empty array is valid)
        return result;
      } catch (error) {
        // If parsing planilla format fails with BadRequestException, throw it
        this.logger.error(`❌ Error al parsear formato Planilla: ${error.message}`);
        this.logger.error(`Stack trace: ${error.stack}`);
        if (error instanceof BadRequestException) {
          throw error;
        }
        // For other errors, log and fall back to traditional format
        this.logger.warn('Haciendo fallback al formato tradicional debido a error inesperado');
        // Continue to traditional format parsing
      }
    } else {
      this.logger.warn('Formato Planilla NO detectado. Intentando formato tradicional...');
    }

    // Traditional format: Convert to JSON with column names
    this.logger.log('=== INICIANDO PARSEO DE FORMATO TRADICIONAL ===');
    const data = XLSX.utils.sheet_to_json(worksheet);
    this.logger.log(`Total de filas en formato tradicional: ${data.length}`);

    if (data.length === 0) {
      this.logger.error('El archivo está vacío o no se pudo parsear en formato tradicional');
      throw new BadRequestException('Excel file is empty or could not be parsed');
    }

    // Log first row to see what columns we have
    const first = data[0] as any;
    this.logger.log(`Primera fila del formato tradicional: ${JSON.stringify(Object.keys(first))}`);
    this.logger.log(`Valores de la primera fila: ${JSON.stringify(first)}`);

    // Validate minimal columns
    const hasAmount = first && (first['amount'] !== undefined || first['monto'] !== undefined || first['Monto'] !== undefined);
    const hasDate = first && (first['date'] !== undefined || first['fecha'] !== undefined || first['Fecha'] !== undefined);
    
    this.logger.log(`¿Tiene columna amount/monto? ${hasAmount}`);
    this.logger.log(`¿Tiene columna date/fecha? ${hasDate}`);
    
    if (!hasAmount || !hasDate) {
      const availableColumns = Object.keys(first || {}).join(', ');
      this.logger.error(`Columnas disponibles: ${availableColumns}`);
      this.logger.error(`Faltan columnas requeridas. Amount: ${hasAmount}, Date: ${hasDate}`);
      throw new BadRequestException(`El archivo no tiene las columnas requeridas. Columnas encontradas: "${availableColumns}". Se requieren: "amount" (o "monto") y "date" (o "fecha"). Si tu archivo es una planilla con conceptos y meses, asegurate de que tenga una fila con "Conceptos" en la primera columna.`);
    }

    // Parse rows without saving
    const parsedRecords = [];
    for (const row of data) {
      const type = (this.sanitizeString(row['type'] || row['Type']) || '').toLowerCase();
      const amount = this.parseNumber(row['amount'] || row['monto'] || row['Monto']);
      const date = this.parseDate(row['date'] || row['fecha'] || row['Fecha']);
      const notes = this.sanitizeString(row['notes'] || row['descripcion'] || row['Descripcion']);

      if (amount === null || !date) continue;

      const currency = (this.sanitizeString(row['currency'] || row['Currency']) || 'ARS').toUpperCase();
      
      if (type === 'income' || row['source'] || row['Source']) {
        const source = this.sanitizeString(row['source'] || row['Source'] || 'Income') || 'Income';
        parsedRecords.push({
          kind: 'income',
          source,
          amount,
          date: date.toISOString(),
          notes: notes || undefined,
          currency,
          person: this.sanitizeString(row['person'] || row['Person']) || undefined,
        });
      } else {
        const categoryName = this.sanitizeString(row['category'] || row['Category'] || row['categoria'] || row['Categoria']) || 'Uncategorized';
        const personName = this.sanitizeString(row['person'] || row['Person']);
        parsedRecords.push({
          kind: 'expense',
          categoryName,
          amount,
          date: date.toISOString(),
          notes: notes || undefined,
          currency,
          person: personName || undefined,
        });
      }
    }

    return {
      records: parsedRecords,
      total: parsedRecords.length,
    };
  }

  async saveParsedRecords(records: any[]) {
    this.logger.log(`=== GUARDANDO ${records.length} REGISTROS ===`);
    const savedRecords = [] as any[];
    
    // Step 1: Recopilar todas las personas únicas del archivo
    const uniquePersonNames = new Set<string>();
    for (const record of records) {
      if (record.person && typeof record.person === 'string' && record.person.trim() !== '') {
        uniquePersonNames.add(record.person.trim());
      }
    }
    
    this.logger.log(`Personas encontradas en el archivo: ${Array.from(uniquePersonNames).join(', ') || 'Ninguna'}`);
    
    // Step 2: Crear todas las personas primero (si no existen) y obtener "Familiar"
    const personMap = new Map<string, string>(); // name -> id
    for (const personName of uniquePersonNames) {
      const person = await this.prisma.person.upsert({
        where: { name: personName },
        update: {},
        create: { name: personName }
      });
      personMap.set(personName, person.id);
      this.logger.log(`Persona "${personName}" procesada (ID: ${person.id})`);
    }
    
    // Obtener o crear la persona "Familiar" para gastos sin persona asignada
    const familiarPerson = await this.prisma.person.upsert({
      where: { name: 'Familiar' },
      update: {},
      create: { name: 'Familiar' }
    });
    const familiarPersonId = familiarPerson.id;
    
    // Step 3: Procesar los registros usando el mapa de personas
    for (const record of records) {
      if (record.kind === 'income') {
        const personName = record.person;
        const personId = personName ? personMap.get(personName) : undefined;
        
        const created = await this.prisma.income.create({
          data: {
            source: record.source,
            amount: record.amount,
            date: new Date(record.date),
            notes: record.notes,
            currency: record.currency,
            personId,
          },
        });
        savedRecords.push({ kind: 'income', ...created });
      } else {
        const typeRow = await this.prisma.categoryType.upsert({ 
          where: { name: 'expense' }, 
          update: {}, 
          create: { name: 'expense' } 
        });
        const existingCategory = await this.prisma.category.findFirst({ 
          where: { name: record.categoryName } 
        });
        const category = existingCategory || (await this.prisma.category.create({ 
          data: { name: record.categoryName, typeId: typeRow.id } 
        }));
        
        const personName = record.person;
        // Si no hay persona asignada, usar "Familiar" como defecto para gastos
        const personId = personName ? personMap.get(personName) : familiarPersonId;
        
        const created = await this.prisma.expense.create({
          data: {
            categoryId: category.id,
            personId,
            amount: record.amount,
            date: new Date(record.date),
            notes: record.notes,
            currency: record.currency,
          },
          include: { category: true },
        });
        savedRecords.push({ kind: 'expense', ...created });
      }
    }

    this.logger.log(`✅ ${savedRecords.length} registros guardados exitosamente`);
    return {
      success: true,
      message: `${savedRecords.length} rows imported successfully`,
      records: savedRecords,
    };
  }

  async parseAndSaveExcel(file: Express.Multer.File) {
    // Use parseExcel and saveParsedRecords
    const parsed = await this.parseExcel(file);
    return this.saveParsedRecords(parsed.records);
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

  private detectPlanillaFormat(arrayData: any[][]): boolean {
    this.logger.log('=== DETECTANDO FORMATO PLANILLA ===');
    this.logger.log(`Buscando "Conceptos" en las primeras ${Math.min(50, arrayData.length)} filas...`);
    
    // Look for a row with "Conceptos" in the first column
    for (let i = 0; i < Math.min(50, arrayData.length); i++) {
      const row = arrayData[i];
      
      // Log first few rows to see what we're checking
      if (i < 10) {
        const firstCellValue = row && row[0] !== null && row[0] !== undefined ? String(row[0]) : 'null/undefined';
        this.logger.log(`  Fila ${i}: primera celda = "${firstCellValue}"`);
      }
      
      if (row && row[0] !== null && row[0] !== undefined && row[0] !== '') {
        const firstCell = String(row[0]).trim().toLowerCase();
        this.logger.log(`  Fila ${i}: comparando "${firstCell}" con "conceptos"`);
        
        if (firstCell === 'conceptos') {
          this.logger.log(`✅ ¡Encontrada fila "Conceptos" en la fila ${i}!`);
          this.logger.log(`  Contenido completo de la fila: ${JSON.stringify(row.slice(0, 15))}`);
          
          // Check if this row has month names
          const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                            'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          let monthCount = 0;
          const foundMonths = [];
          
          for (let j = 1; j < Math.min(row.length, 20); j++) {
            const cell = String(row[j] || '').trim().toLowerCase();
            if (monthNames.includes(cell)) {
              monthCount++;
              foundMonths.push(cell);
              this.logger.log(`  ✅ Mes encontrado en columna ${j}: "${cell}"`);
            }
          }
          
          this.logger.log(`  Total de meses encontrados: ${monthCount}`);
          this.logger.log(`  Meses encontrados: ${foundMonths.join(', ')}`);
          
          const result = monthCount >= 3;
          this.logger.log(`  ¿Formato Planilla válido? ${result} (se requieren al menos 3 meses)`);
          
          return result; // At least 3 months found
        }
      }
    }
    
    this.logger.warn('❌ No se encontró una fila con "Conceptos" en las primeras 50 filas');
    return false;
  }

  private async parsePlanillaFormat(arrayData: any[][], worksheet: XLSX.WorkSheet): Promise<{ records: any[]; total: number }> {
    this.logger.log('=== INICIANDO PARSEO DE FORMATO PLANILLA ===');
    const parsedRecords = [];
    
    // Get all existing persons from database for comparison
    const existingPersons = await this.prisma.person.findMany({
      select: { name: true }
    });
    const personNamesSet = new Set(existingPersons.map(p => p.name.toLowerCase().trim()));
    this.logger.log(`Personas existentes en DB: ${Array.from(personNamesSet).join(', ')}`);
    
    // Get or create "Familiar" person for default assignment
    const familiarPerson = await this.prisma.person.upsert({
      where: { name: 'Familiar' },
      update: {},
      create: { name: 'Familiar' }
    });
    const familiarPersonName = familiarPerson.name;
    
    // Find the header row with "Conceptos"
    let headerRowIndex = -1;
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                        'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 11, 12]; // setiembre and septiembre both map to 9
    
    this.logger.log('Buscando fila con "Conceptos"...');
    for (let i = 0; i < Math.min(50, arrayData.length); i++) {
      const row = arrayData[i];
      if (row && row[0] !== null && row[0] !== undefined && row[0] !== '') {
        const firstCell = String(row[0]).trim().toLowerCase();
        if (firstCell === 'conceptos') {
          headerRowIndex = i;
          this.logger.log(`✅ Fila "Conceptos" encontrada en índice ${i}`);
          break;
        }
      }
    }

    if (headerRowIndex === -1) {
      this.logger.error('No se encontró la fila con "Conceptos"');
      throw new BadRequestException('No se pudo encontrar la fila con "Conceptos". Verificá que tu archivo tenga una fila con "Conceptos" en la primera columna.');
    }

    const headerRow = arrayData[headerRowIndex];
    this.logger.log(`Fila de encabezados: ${JSON.stringify(headerRow.slice(0, 15))}`);
    
    // Find year from first row or use current year
    let year = new Date().getFullYear();
    if (arrayData[0] && arrayData[0][0] !== null && arrayData[0][0] !== undefined) {
      const firstCellValue = arrayData[0][0];
      this.logger.log(`Primera celda de la primera fila: ${JSON.stringify(firstCellValue)} (tipo: ${typeof firstCellValue})`);
      if (typeof firstCellValue === 'number') {
        const yearCandidate = firstCellValue;
        if (yearCandidate >= 2000 && yearCandidate <= 2100) {
          year = yearCandidate;
          this.logger.log(`Año extraído: ${year}`);
        } else {
          this.logger.warn(`Valor ${yearCandidate} no es un año válido, usando año actual ${year}`);
        }
      } else {
        this.logger.warn(`Primera celda no es un número, usando año actual ${year}`);
      }
    } else {
      this.logger.warn(`No se pudo obtener año de la primera fila, usando año actual ${year}`);
    }

    // Map month columns to their indices
    const monthColumnMap: { [key: number]: number } = {}; // month number -> column index
    let personColumnIndex: number | null = null; // Column index for "Persona" or "Person"
    
    this.logger.log('Mapeando columnas de meses y persona...');
    for (let j = 1; j < headerRow.length; j++) {
      const cell = String(headerRow[j] || '').trim().toLowerCase();
      
      // Check if this is a person column
      if (cell === 'persona' || cell === 'person' || cell === 'personas') {
        personColumnIndex = j;
        this.logger.log(`  Columna de persona encontrada en índice ${j}`);
        continue;
      }
      
      // Check if this is a month
      const monthIndex = monthNames.indexOf(cell);
      if (monthIndex !== -1) {
        monthColumnMap[monthNumbers[monthIndex]] = j;
        this.logger.log(`  Mes "${cell}" (número ${monthNumbers[monthIndex]}) mapeado a columna ${j}`);
      }
    }

    this.logger.log(`Total de columnas de meses mapeadas: ${Object.keys(monthColumnMap).length}`);
    if (Object.keys(monthColumnMap).length === 0) {
      this.logger.error('No se encontraron columnas de meses');
      throw new BadRequestException('No se pudieron encontrar las columnas de meses en la fila de encabezados. Verificá que la fila con "Conceptos" tenga nombres de meses (Enero, Febrero, etc.).');
    }
    
    if (personColumnIndex !== null) {
      this.logger.log(`Columna de persona detectada en índice ${personColumnIndex}`);
    } else {
      this.logger.log('No se detectó columna de persona en el encabezado');
    }

    // Helper function to check if a cell is bold
    const isCellBold = (rowIndex: number, colIndex: number): boolean => {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = worksheet[cellAddress];
      if (cell && cell.s && cell.s.font) {
        return cell.s.font.bold === true;
      }
      return false;
    };

    // Parse data rows starting after header row
    this.logger.log(`Procesando filas desde ${headerRowIndex + 1} hasta ${Math.min(arrayData.length, headerRowIndex + 1000)}...`);
    let rowsProcessed = 0;
    let rowsWithValues = 0;
    let sampleRowsLogged = 0;
    
    // Track current section (e.g., "Mesada", "Ingresos", etc.)
    let currentSection: string | null = null;
    const sectionNames = ['mesada', 'ingresos', 'gastos', 'alimentos', 'servicios', 'mantenimiento', 
                          'transporte', 'salud', 'educacion', 'entretenimiento', 'vacaciones', 'inversiones'];
    
    // Track current person - no longer using bold detection since bold rows are separators
    let currentPerson: string | null = null;
    
    for (let i = headerRowIndex + 1; i < Math.min(arrayData.length, headerRowIndex + 1000); i++) {
      const row = arrayData[i] as any[];
      if (!row || !row[0] || typeof row[0] !== 'string') continue;
      
      rowsProcessed++;
      let concept = this.sanitizeString(row[0]);
      if (!concept || concept.trim() === '') continue;

      // Extract text in parentheses and move to notes
      let notes = '';
      const parenthesesMatch = concept.match(/\(([^)]+)\)/);
      if (parenthesesMatch) {
        notes = parenthesesMatch[1].trim();
        // Remove parentheses content from concept
        concept = concept.replace(/\([^)]+\)/g, '').trim();
        this.logger.log(`  Fila ${i} - Texto entre paréntesis extraído a notas: "${notes}" de concepto "${concept}"`);
      }

      const conceptLower = concept.toLowerCase().trim();

      // Check if this row is "Total" - reset current person
      if (conceptLower === 'total') {
        this.logger.log(`  Fila ${i} - "Total" encontrado, reseteando persona actual`);
        currentPerson = null;
        continue;
      }

      // Check if this row is a section header
      const isSection = sectionNames.some(section => conceptLower.includes(section));
      
      if (isSection) {
        currentSection = conceptLower;
        currentPerson = null; // Reset person when entering new section
        this.logger.log(`  Sección detectada en fila ${i}: "${currentSection}"`);
        continue; // Skip section header row
      }

      // Check if we've left the current section (empty row or new section)
      if (currentSection && (conceptLower === '' || this.isSectionHeader(conceptLower))) {
        currentSection = null;
        currentPerson = null;
      }

      // Skip rows in bold - they are separators or account headers, not person names
      if (isCellBold(i, 0)) {
        this.logger.log(`  Fila ${i} - Fila en negrita ignorada (separador/cuenta): "${concept}"`);
        continue; // Skip separator/account header rows
      }

      // Determine category and person based on section and current person
      let categoryName: string;
      let personName: string | null = null;

      // If we have a current person (from bold detection), use it
      // But validate it's still a valid person name
      if (currentPerson && this.isValidPersonName(currentPerson)) {
        personName = currentPerson;
        categoryName = concept;
        this.logger.log(`  Fila ${i} - Categoría: "${categoryName}" - Persona: "${personName}"`);
      } else if (currentPerson && !this.isValidPersonName(currentPerson)) {
        // Reset invalid person
        currentPerson = null;
        categoryName = concept;
        personName = null;
      }
      // If we're in "Mesada" section, check if concept matches a person from database
      else if (currentSection && currentSection.includes('mesada')) {
        // Check if concept matches an existing person name in the database
        const conceptLower = concept.toLowerCase().trim();
        const matchingPerson = existingPersons.find(p => p.name.toLowerCase().trim() === conceptLower);
        
        if (matchingPerson) {
          // Concept matches an existing person, assign to person and use "mesada" as category
          personName = matchingPerson.name; // Use the exact name from DB (preserve capitalization)
          categoryName = 'mesada';
          this.logger.log(`  Fila ${i} - Sección Mesada: Persona="${personName}", Categoría="mesada"`);
        } else {
          // Not a person, treat as category
          categoryName = concept;
          personName = null;
        }
      } 
      // If we're in "Ingresos" section, check if concept matches a person from database
      else if (currentSection && currentSection.includes('ingresos')) {
        // Check if concept matches an existing person name in the database
        const conceptLower = concept.toLowerCase().trim();
        const matchingPerson = existingPersons.find(p => p.name.toLowerCase().trim() === conceptLower);
        
        if (matchingPerson) {
          // Concept matches an existing person, assign to person and use "ingresos" as category
          personName = matchingPerson.name; // Use the exact name from DB (preserve capitalization)
          categoryName = 'ingresos';
          this.logger.log(`  Fila ${i} - Sección Ingresos: Persona="${personName}", Categoría="ingresos"`);
        } else {
          // It's a category, try to get person from column
          categoryName = concept;
          const personFromColumn = personColumnIndex !== null && row[personColumnIndex] 
            ? this.sanitizeString(row[personColumnIndex]) 
            : undefined;
          // Check if person from column matches an existing person
          if (personFromColumn) {
            const personFromColumnLower = personFromColumn.toLowerCase().trim();
            const matchingPersonFromColumn = existingPersons.find(p => p.name.toLowerCase().trim() === personFromColumnLower);
            personName = matchingPersonFromColumn ? matchingPersonFromColumn.name : null;
          }
        }
      }
      // Default: check if concept is a person name from database
      else {
        // Check if the concept matches an existing person name in the database
        const conceptLower = concept.toLowerCase().trim();
        const matchingPerson = existingPersons.find(p => p.name.toLowerCase().trim() === conceptLower);
        
        if (matchingPerson) {
          // Concept matches an existing person name, assign to person and use "unknown" as category
          personName = matchingPerson.name; // Use the exact name from DB (preserve capitalization)
          categoryName = 'unknown';
          this.logger.log(`  Fila ${i} - Concepto coincide con persona existente: "${personName}", Categoría="unknown"`);
        } else {
          // Concept is a category, try to get person from column
          categoryName = concept;
          const personFromColumn = personColumnIndex !== null && row[personColumnIndex] 
            ? this.sanitizeString(row[personColumnIndex]) 
            : undefined;
          // Check if person from column matches an existing person
          if (personFromColumn) {
            const personFromColumnLower = personFromColumn.toLowerCase().trim();
            const matchingPersonFromColumn = existingPersons.find(p => p.name.toLowerCase().trim() === personFromColumnLower);
            personName = matchingPersonFromColumn ? matchingPersonFromColumn.name : undefined;
          }
        }
      }

      // Log first few rows to see what we're getting
      if (sampleRowsLogged < 5) {
        this.logger.log(`  Fila ${i} - Concepto: "${concept}" - Categoría: "${categoryName}"${personName ? ` - Persona: "${personName}"` : ''} - Sección: ${currentSection || 'ninguna'}`);
        this.logger.log(`    Valores en columnas de meses: ${JSON.stringify(
          Object.entries(monthColumnMap).map(([monthStr, colIdx]) => ({
            month: monthStr,
            column: colIdx,
            value: row[colIdx],
            type: typeof row[colIdx]
          })).slice(0, 3)
        )}`);
        sampleRowsLogged++;
      }

      // Skip category headers (rows that are just category names without values)
      // We'll process actual expense rows
      let hasValueInRow = false;
      for (const [monthStr, columnIndex] of Object.entries(monthColumnMap)) {
        const month = parseInt(monthStr);
        const value = row[columnIndex];
        
        // Check if value exists and is a valid number
        const isNumber = typeof value === 'number' && !isNaN(value) && isFinite(value);
        const isEmpty = value === null || value === undefined || value === '';
        
        if (sampleRowsLogged <= 3 && !isEmpty) {
          this.logger.log(`    Columna ${columnIndex} (mes ${month}): valor="${value}", tipo=${typeof value}, esNumero=${isNumber}`);
        }
        
        if (!isEmpty && isNumber && value > 0) {
          hasValueInRow = true;
          // Create date for the first day of the month
          const date = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
          
          // Determine if this is income or expense based on section
          const kind = (currentSection && currentSection.includes('ingresos')) ? 'income' : 'expense';
          
          // If no person assigned, use "Familiar" as default
          const assignedPerson = personName || familiarPersonName;
          
          parsedRecords.push({
            kind,
            categoryName,
            amount: value,
            date: date.toISOString(),
            currency: 'ARS',
            person: assignedPerson,
            source: kind === 'income' ? categoryName : undefined,
            notes: notes || undefined,
          });
          
          if (parsedRecords.length <= 5) {
            this.logger.log(`  ✅ Registro ${parsedRecords.length}: ${kind} - Categoría: "${categoryName}"${personName ? ` - Persona: "${personName}"` : ''} - Mes ${month} - ${value} ARS`);
          }
        }
      }
      
      if (hasValueInRow) {
        rowsWithValues++;
      }
    }

    this.logger.log(`Filas procesadas: ${rowsProcessed}`);
    this.logger.log(`Filas con valores: ${rowsWithValues}`);
    this.logger.log(`Total de registros creados: ${parsedRecords.length}`);

    return {
      records: parsedRecords,
      total: parsedRecords.length,
    };
  }
}
