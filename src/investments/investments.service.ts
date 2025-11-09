import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { UpdateInvestmentDto } from './dto/update-investment.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvestmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.investment.findMany({
      orderBy: { createdAt: 'desc' },
      include: { category: { include: { type: true } } },
    });
  }

  async findOne(id: string) {
    const investment = await this.prisma.investment.findUnique({
      where: { id },
      include: { category: { include: { type: true } } },
    });
    if (!investment) throw new NotFoundException('Investment not found');
    return investment;
  }

  async create(dto: CreateInvestmentDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      include: { type: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    
    // Verify that the category type is one of the investment types
    const investmentTypes = ['moneda', 'equity', 'crypto'];
    if (!investmentTypes.includes(category.type.name.toLowerCase())) {
      throw new NotFoundException('Category must be of type "moneda", "equity", or "crypto"');
    }

    const data = {
      categoryId: dto.categoryId,
      concept: dto.concept,
      currentAmount: dto.currentAmount,
      currentPrice: dto.currentPrice,
      tag: dto.tag || null,
      originalAmount: dto.originalAmount,
    } as unknown as Prisma.InvestmentUncheckedCreateInput;

    return this.prisma.investment.create({
      data,
      include: { category: { include: { type: true } } },
    });
  }

  async update(id: string, dto: UpdateInvestmentDto) {
    await this.findOne(id);
    
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        include: { type: true },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      
      // Verify that the category type is one of the investment types
      const investmentTypes = ['moneda', 'equity', 'crypto'];
      if (!investmentTypes.includes(category.type.name.toLowerCase())) {
        throw new NotFoundException('Category must be of type "moneda", "equity", or "crypto"');
      }
    }

    const data = {
      categoryId: dto.categoryId,
      concept: dto.concept,
      currentAmount: dto.currentAmount,
      currentPrice: dto.currentPrice,
      tag: dto.tag,
      originalAmount: dto.originalAmount,
    } as unknown as Prisma.InvestmentUncheckedUpdateInput;

    return this.prisma.investment.update({
      where: { id },
      data,
      include: { category: { include: { type: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.investment.delete({ where: { id } });
    return { id };
  }
}

