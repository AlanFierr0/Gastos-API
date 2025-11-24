import { Controller, Get, Post, Body, Param, Delete, ParseUUIDPipe, Query } from '@nestjs/common';
import { HoldingOperationsService } from './holding-operations.service';
import { CreateHoldingOperationDto } from './dto/create-holding-operation.dto';

@Controller('holding-operations')
export class HoldingOperationsController {
  constructor(private readonly holdingOperationsService: HoldingOperationsService) {}

  @Post()
  create(@Body() createHoldingOperationDto: CreateHoldingOperationDto) {
    return this.holdingOperationsService.create(createHoldingOperationDto);
  }

  @Get()
  findAll(@Query('holdingId') holdingId?: string) {
    return this.holdingOperationsService.findAll(holdingId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.holdingOperationsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.holdingOperationsService.remove(id);
  }
}

