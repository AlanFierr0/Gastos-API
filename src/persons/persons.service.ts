import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePersonDto) {
    return this.prisma.person.create({
      data: {
        name: dto.name,
      },
      include: {
        holdings: {
          include: {
            category: { include: { type: true } },
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.person.findMany({
      orderBy: { name: 'asc' },
      include: {
        holdings: {
          include: {
            category: { include: { type: true } },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: {
        holdings: {
          include: {
            category: { include: { type: true } },
            operations: {
              orderBy: { date: 'asc' },
            },
          },
        },
      },
    });
    if (!person) throw new NotFoundException('Person not found');
    return person;
  }

  async update(id: string, dto: UpdatePersonDto) {
    await this.findOne(id);
    return this.prisma.person.update({
      where: { id },
      data: dto,
      include: {
        holdings: {
          include: {
            category: { include: { type: true } },
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.person.delete({ where: { id } });
    return { id };
  }
}
 