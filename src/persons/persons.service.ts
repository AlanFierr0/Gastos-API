import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPersonDto } from './dto/upsert-person.dto';

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.person.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: UpsertPersonDto) {
    return this.prisma.person.create({ data: { name: dto.name, icon: dto.icon, color: dto.color } });
  }

  async update(id: string, dto: UpsertPersonDto) {
    const exists = await this.prisma.person.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Person not found');
    return this.prisma.person.update({ where: { id }, data: { name: dto.name, icon: dto.icon, color: dto.color } });
  }

  async remove(id: string) {
    const exists = await this.prisma.person.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Person not found');
    await this.prisma.person.delete({ where: { id } });
    return { id };
  }
}



