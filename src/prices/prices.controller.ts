import { Controller, Get, Post, Param } from '@nestjs/common';
import { PricesService } from './prices.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('prices')
@Controller('prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Post('update')
  @ApiOperation({ summary: 'Actualizar todos los precios desde las APIs' })
  @ApiResponse({ status: 200, description: 'Precios actualizados exitosamente' })
  async updatePrices() {
    return this.pricesService.updateAllPrices();
  }

  @Post('update-investments')
  @ApiOperation({ summary: 'Actualizar precios actuales de las inversiones' })
  @ApiResponse({ status: 200, description: 'Precios de inversiones actualizados' })
  async updateInvestmentPrices() {
    return this.pricesService.updateInvestmentPrices();
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los precios guardados' })
  @ApiResponse({ status: 200, description: 'Lista de precios' })
  async getAllPrices() {
    return this.pricesService.getAllPrices();
  }

  @Get('symbol/:symbol')
  @ApiOperation({ summary: 'Obtener precio de un símbolo específico' })
  @ApiResponse({ status: 200, description: 'Precio del símbolo' })
  async getPrice(@Param('symbol') symbol: string) {
    const price = await this.pricesService.getPrice(symbol);
    return { symbol, price };
  }
}

