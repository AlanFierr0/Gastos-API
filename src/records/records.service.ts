import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';

@Injectable()
export class RecordsService {
  constructor(private _prisma: PrismaService) {}

  async create(_createRecordDto: CreateRecordDto) {
    // Records model does not exist in schema; not implemented
    throw new Error('RecordsService.create is not implemented');
  }

  async findAll() {
    return [];
  }

  async findOne(id: string) {
    throw new NotFoundException(`Record with ID ${id} not found`);
  }

  async update(id: string, updateRecordDto: UpdateRecordDto) {
    const updateData: any = { ...updateRecordDto };
    if (updateRecordDto.fecha) {
      updateData.fecha = new Date(updateRecordDto.fecha);
    }
    throw new NotFoundException(`Record with ID ${id} not found`);
  }

  async remove(id: string) {
    throw new NotFoundException(`Record with ID ${id} not found`);
  }
}
