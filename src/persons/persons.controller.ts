import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { PersonsService } from './persons.service';
import { UpsertPersonDto } from './dto/upsert-person.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('persons')
@Controller('persons')
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  findAll() {
    return this.personsService.findAll();
  }

  @Post()
  create(@Body() dto: UpsertPersonDto) {
    return this.personsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertPersonDto) {
    return this.personsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.personsService.remove(id);
  }
}



