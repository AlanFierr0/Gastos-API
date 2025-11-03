import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';
import { QueryIncomeDto } from './dto/query-income.dto';

@Injectable()
export class IncomeService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryIncomeDto) {
    const where: any = {};
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }
    if (query.source) {
      where.source = { contains: query.source, mode: 'insensitive' };
    }
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.amount = {};
      if (query.minAmount !== undefined) where.amount.gte = query.minAmount;
      if (query.maxAmount !== undefined) where.amount.lte = query.maxAmount;
    }
    return this.prisma.income.findMany({ orderBy: { date: 'desc' }, where });
  }

  async findOne(id: string) {
    const income = await this.prisma.income.findUnique({ where: { id } });
    if (!income) throw new NotFoundException('Income not found');
    return income;
  }

  create(dto: CreateIncomeDto) {
    return this.prisma.income.create({
      data: {
        source: dto.source,
        amount: dto.amount,
        date: new Date(dto.date),
        notes: dto.notes,
        currency: dto.currency || 'USD',
      },
    });
  }

  async update(id: string, dto: UpdateIncomeDto) {
    await this.findOne(id);
    return this.prisma.income.update({
      where: { id },
      data: {
        source: dto.source,
        amount: dto.amount,
        date: dto.date ? new Date(dto.date) : undefined,
        notes: dto.notes,
      },
      
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.income.delete({ where: { id } });
    return { id };
  }
}


