import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHoldingDto } from './dto/create-holding.dto';
import { UpdateHoldingDto } from './dto/update-holding.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class HoldingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(personId?: string) {
    const where: Prisma.HoldingWhereInput = personId ? { personId } : {};
    
    const holdings = await this.prisma.holding.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { 
        person: true,
        category: { include: { type: true } },
        operations: {
          orderBy: { date: 'asc' },
        },
      },
    });

    return holdings.map(holding => {
      const averageCost = this.calculateAverageCost(holding);
      return {
        ...holding,
        averageCost,
      };
    });
  }

  private calculateAverageCost(holding: any): number {
    const purchases: Array<{ amount: number; price: number; date: Date }> = [];

    if (holding.originalAmount > 0 && holding.currentAmount > 0) {
      const originalPrice = holding.originalAmount / holding.currentAmount;
      purchases.push({
        amount: holding.currentAmount,
        price: originalPrice,
        date: new Date(holding.date),
      });
    }

    const buyOperations = holding.operations
      ?.filter((op: any) => op.type === 'COMPRA' && op.price && op.price > 0)
      .sort((a: any, b: any) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime()) || [];

    for (const op of buyOperations) {
      purchases.push({
        amount: op.amount,
        price: op.price,
        date: new Date(op.date || op.createdAt),
      });
    }

    if (purchases.length === 0) {
      return 0;
    }

    purchases.sort((a, b) => a.date.getTime() - b.date.getTime());

    let totalCost = 0;
    let totalAmount = 0;

    for (const purchase of purchases) {
      totalCost += purchase.amount * purchase.price;
      totalAmount += purchase.amount;
    }

    return totalAmount > 0 ? totalCost / totalAmount : 0;
  }

  async findOne(id: string) {
    const holding = await this.prisma.holding.findUnique({
      where: { id },
      include: { 
        person: true,
        category: { include: { type: true } },
        operations: {
          orderBy: { date: 'asc' },
        },
      },
    });
    if (!holding) throw new NotFoundException('Holding not found');
    return holding;
  }

  async create(dto: CreateHoldingDto) {
    const person = await this.prisma.person.findUnique({
      where: { id: dto.personId },
    });
    if (!person) {
      throw new NotFoundException('Person not found');
    }

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      include: { type: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    
    const investmentTypes = ['dolar', 'equity', 'crypto'];
    if (!investmentTypes.includes(category.type.name.toLowerCase())) {
      throw new NotFoundException('Category must be of type "dolar", "equity", or "crypto"');
    }

    const data = {
      personId: dto.personId,
      categoryId: dto.categoryId,
      concept: dto.concept,
      currentAmount: dto.currentAmount,
      currentPrice: dto.currentPrice,
      tag: dto.tag || null,
      sector: dto.sector || null,
      originalAmount: dto.originalAmount,
      date: dto.date ? new Date(dto.date) : new Date(),
      custodyEntity: dto.custodyEntity || null,
      x100: dto.x100 ?? false,
      gbp: dto.gbp ?? false,
    } as unknown as Prisma.HoldingUncheckedCreateInput;

    return this.prisma.holding.create({
      data,
      include: { 
        person: true,
        category: { include: { type: true } },
      },
    });
  }

  async update(id: string, dto: UpdateHoldingDto) {
    const existing = await this.findOne(id);
    
    if (dto.personId) {
      const person = await this.prisma.person.findUnique({
        where: { id: dto.personId },
      });
      if (!person) {
        throw new NotFoundException('Person not found');
      }
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        include: { type: true },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      
      const investmentTypes = ['dolar', 'equity', 'crypto'];
      if (!investmentTypes.includes(category.type.name.toLowerCase())) {
        throw new NotFoundException('Category must be of type "dolar", "equity", or "crypto"');
      }
    }

    const data: Prisma.HoldingUncheckedUpdateInput = {
      personId: dto.personId,
      categoryId: dto.categoryId,
      concept: dto.concept,
      currentAmount: dto.currentAmount,
      currentPrice: dto.currentPrice,
      tag: dto.tag,
      sector: dto.sector,
      originalAmount: dto.originalAmount,
      custodyEntity: dto.custodyEntity,
    };

    if (dto.date !== undefined) {
      data.date = new Date(dto.date);
    }

    if (dto.x100 !== undefined) {
      data.x100 = dto.x100;
    }

    if (dto.gbp !== undefined) {
      data.gbp = dto.gbp;
    }

    return this.prisma.holding.update({
      where: { id },
      data,
      include: { 
        person: true,
        category: { include: { type: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.holding.delete({ where: { id } });
    return { id };
  }
}

