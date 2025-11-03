import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryExpenseDto) {
    const where: any = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.personId) where.personId = query.personId;
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
    return this.prisma.expense.findMany({ orderBy: { date: 'desc' }, where, include: { category: true, person: true } });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: { category: true } });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  private toUtcNoon(dateIso: string): Date {
    const d = new Date(dateIso);
    // Normalize to 12:00 UTC to avoid boundary shifts
    d.setUTCHours(12, 0, 0, 0);
    return d;
  }

  async create(dto: CreateExpenseDto) {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId }, include: { type: true } });
    if (!category || category.type.name.toLowerCase() !== 'expense') {
      throw new NotFoundException('Category not found or not of type "expense"');
    }
    if (dto.personId) {
      const person = await this.prisma.person.findUnique({ where: { id: dto.personId } });
      if (!person) throw new NotFoundException('Person not found');
    }
    return this.prisma.expense.create({
      data: { categoryId: dto.categoryId, personId: dto.personId, amount: dto.amount, date: this.toUtcNoon(dto.date), notes: dto.notes, currency: dto.currency || 'USD' },
      include: { category: true, person: true },
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
    if (dto.personId) {
      const person = await this.prisma.person.findUnique({ where: { id: dto.personId } });
      if (!person) throw new NotFoundException('Person not found');
    }
    return this.prisma.expense.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        personId: dto.personId,
        amount: dto.amount,
        date: dto.date ? this.toUtcNoon(dto.date) : undefined,
        notes: dto.notes,
        currency: dto.currency,
      },
      include: { category: true, person: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.expense.delete({ where: { id } });
    return { id };
  }
}


