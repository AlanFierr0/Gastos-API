import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { normalizeCategoryName } from '../common/utils/category.util';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { type: true },
    });
  }

  create(dto: CreateCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      let typeId = dto.typeId;
      if (!typeId) {
        const normalizedTypeName = normalizeCategoryName(dto.typeName) ?? 'expense';
        const type = await tx.categoryType.upsert({
          where: { name: normalizedTypeName },
          update: {},
          create: { name: normalizedTypeName },
        });
        typeId = type.id;
      }
      const normalizedName = normalizeCategoryName(dto.name);
      if (!normalizedName) {
        throw new BadRequestException('Category name cannot be empty');
      }
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


