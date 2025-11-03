import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';

@Injectable()
export class RecordsService {
  constructor(private prisma: PrismaService) {}

  async create(createRecordDto: CreateRecordDto) {
    return this.prisma.record.create({
      data: {
        concepto: createRecordDto.concepto,
        monto: createRecordDto.monto,
        fecha: new Date(createRecordDto.fecha),
        categoria: createRecordDto.categoria,
        descripcion: createRecordDto.descripcion,
      },
    });
  }

  async findAll() {
    return this.prisma.record.findMany({
      orderBy: { fecha: 'desc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.record.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Record with ID ${id} not found`);
    }

    return record;
  }

  async update(id: string, updateRecordDto: UpdateRecordDto) {
    const record = await this.prisma.record.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Record with ID ${id} not found`);
    }

    const updateData: any = { ...updateRecordDto };
    if (updateRecordDto.fecha) {
      updateData.fecha = new Date(updateRecordDto.fecha);
    }

    return this.prisma.record.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    const record = await this.prisma.record.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Record with ID ${id} not found`);
    }

    return this.prisma.record.delete({
      where: { id },
    });
  }
}
