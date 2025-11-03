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
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.personId) where.personId = query.personId;
    return this.prisma.income.findMany({ orderBy: { date: 'desc' }, where, include: { category: true, person: true } });
  }

  async findOne(id: string) {
    const income = await this.prisma.income.findUnique({ where: { id }, include: { category: true, person: true } });
    if (!income) throw new NotFoundException('Income not found');
    return income;
  }

  private toUtcNoon(dateIso: string): Date {
    const d = new Date(dateIso);
    d.setUTCHours(12, 0, 0, 0);
    return d;
  }

  async create(dto: CreateIncomeDto) {
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId }, include: { type: true } });
      if (!category || category.type.name.toLowerCase() !== 'income') {
        throw new NotFoundException('Category not found or not of type "income"');
      }
    }
    if (dto.personId) {
      const person = await this.prisma.person.findUnique({ where: { id: dto.personId } });
      if (!person) throw new NotFoundException('Person not found');
    }
    return this.prisma.income.create({
      data: {
        source: dto.source,
        amount: dto.amount,
        date: this.toUtcNoon(dto.date),
        notes: dto.notes,
        currency: dto.currency || 'USD',
        categoryId: dto.categoryId,
        personId: dto.personId,
      },
      include: { category: true, person: true },
    });
  }

  async update(id: string, dto: UpdateIncomeDto) {
    await this.findOne(id);
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId }, include: { type: true } });
      if (!category || category.type.name.toLowerCase() !== 'income') {
        throw new NotFoundException('Category not found or not of type "income"');
      }
    }
    if (dto.personId) {
      const person = await this.prisma.person.findUnique({ where: { id: dto.personId } });
      if (!person) throw new NotFoundException('Person not found');
    }
    return this.prisma.income.update({
      where: { id },
      data: {
        source: dto.source,
        amount: dto.amount,
        date: dto.date ? this.toUtcNoon(dto.date) : undefined,
        notes: dto.notes,
        currency: dto.currency,
        categoryId: dto.categoryId,
        personId: dto.personId,
      },
      include: { category: true, person: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.income.delete({ where: { id } });
    return { id };
  }
}


