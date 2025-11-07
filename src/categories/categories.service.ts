import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { type: true },
    });
  }

  private normalizeName(name: string) {
    return String(name || '').trim().toLowerCase();
  }

  create(dto: CreateCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      let typeId = dto.typeId;
      if (!typeId) {
        const name = this.normalizeName(dto.typeName || 'expense');
        const type = await tx.categoryType.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        typeId = type.id;
      }
      const normalizedName = this.normalizeName(dto.name);
      const existing = await tx.category.findFirst({
        where: { name: normalizedName, typeId },
        include: { type: true },
      });
      if (existing) {
        return existing;
      }
      return tx.category.create({
        data: { name: normalizedName, typeId },
        include: { type: true },
      });
    });
  }
}


