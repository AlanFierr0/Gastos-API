import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' }, include: { type: true } });
  }

  create(dto: CreateCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      let typeId = dto.typeId;
      if (!typeId) {
        const name = (dto.typeName || 'expense').trim();
        const type = await tx.categoryType.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        typeId = type.id;
      }
      return tx.category.create({ data: { name: dto.name, typeId }, include: { type: true } });
    });
  }
}


