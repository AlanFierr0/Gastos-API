import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';
import { Prisma } from '@prisma/client';
import { toUtcNoon } from '../common/utils/date.util';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryExpenseDto) {
    const where: any = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.amount = {};
      if (query.minAmount !== undefined) where.amount.gte = query.minAmount;
      if (query.maxAmount !== undefined) where.amount.lte = query.maxAmount;
    }
    return this.prisma.expense.findMany({ orderBy: { date: 'desc' }, where, include: { category: true } });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: { category: true } });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async create(dto: CreateExpenseDto) {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId }, include: { type: true } });
    if (!category || category.type.name.toLowerCase() !== 'expense') {
      throw new NotFoundException('Category not found or not of type "expense"');
    }
    
    const data = {
      categoryId: dto.categoryId,
      concept: dto.concept,
      amount: dto.amount,
      date: toUtcNoon(dto.date),
      note: dto.note,
      currency: dto.currency || 'ARS',
    } as unknown as Prisma.ExpenseUncheckedCreateInput;

    return this.prisma.expense.create({
      data,
      include: { category: true },
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.findOne(id);
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId }, include: { type: true } });
      if (!category || category.type.name.toLowerCase() !== 'expense') {
        throw new NotFoundException('Category not found or not of type "expense"');
      }
    }

    const data = {
      categoryId: dto.categoryId,
      concept: dto.concept,
      amount: dto.amount,
      date: dto.date ? toUtcNoon(dto.date) : undefined,
      note: dto.note,
      currency: dto.currency,
    } as unknown as Prisma.ExpenseUncheckedUpdateInput;

    return this.prisma.expense.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.expense.delete({ where: { id } });
    return { id };
  }
}


