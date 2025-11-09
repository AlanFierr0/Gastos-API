import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { InvestmentOperationsService } from './investment-operations.service';
import { CreateInvestmentOperationDto } from './dto/create-investment-operation.dto';
import { UpdateInvestmentOperationDto } from './dto/update-investment-operation.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('investment-operations')
@Controller('investment-operations')
export class InvestmentOperationsController {
  constructor(private readonly investmentOperationsService: InvestmentOperationsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva operación de inversión' })
  @ApiResponse({ status: 201, description: 'Operación creada exitosamente' })
  create(@Body() createDto: CreateInvestmentOperationDto) {
    return this.investmentOperationsService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las operaciones de inversión' })
  @ApiResponse({ status: 200, description: 'Lista de operaciones' })
  findAll(@Query('investmentId') investmentId?: string) {
    return this.investmentOperationsService.findAll(investmentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una operación específica' })
  @ApiResponse({ status: 200, description: 'Operación encontrada' })
  findOne(@Param('id') id: string) {
    return this.investmentOperationsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una operación' })
  @ApiResponse({ status: 200, description: 'Operación actualizada' })
  update(@Param('id') id: string, @Body() updateDto: UpdateInvestmentOperationDto) {
    return this.investmentOperationsService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una operación' })
  @ApiResponse({ status: 200, description: 'Operación eliminada' })
  remove(@Param('id') id: string) {
    return this.investmentOperationsService.remove(id);
  }
}

