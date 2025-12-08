import { Controller, Get, Post, Param, Query, Logger } from '@nestjs/common';
import { PricesService } from './prices.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('prices')
@Controller('prices')
export class PricesController {
  private readonly logger = new Logger(PricesController.name);
  
  constructor(private readonly pricesService: PricesService) {
    this.logger.log('PricesController initialized');
    console.log('[PricesController] Controller initialized');
  }

  @Post('update')
  @ApiOperation({ summary: 'Actualizar todos los precios desde las APIs' })
  @ApiResponse({ status: 200, description: 'Precios actualizados exitosamente' })
  async updatePrices(@Query('force') force?: string) {
    const timestamp = new Date().toISOString();
    const forceUpdate = force === 'true' || force === '1';
    console.log(`[${timestamp}] [PricesController] updatePrices endpoint called, force: ${forceUpdate}`);
    this.logger.log(`updatePrices endpoint called at ${timestamp}, force: ${forceUpdate}`);
    
    try {
      const result = await this.pricesService.updateAllPrices(forceUpdate);
      console.log(`[${timestamp}] [PricesController] updatePrices completed:`, JSON.stringify(result));
      this.logger.log(`updatePrices completed: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.error(`[${timestamp}] [PricesController] updatePrices error:`, error);
      this.logger.error(`updatePrices error: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('update-investments')
  @ApiOperation({ summary: 'Actualizar precios actuales de las inversiones' })
  @ApiResponse({ status: 200, description: 'Precios de inversiones actualizados' })
  async updateInvestmentPrices() {
    return this.pricesService.updateInvestmentPrices();
  }

  @Post('update-holdings')
  @ApiOperation({ summary: 'Actualizar precios actuales de las tenencias' })
  @ApiResponse({ status: 200, description: 'Precios de tenencias actualizados' })
  async updateHoldingPrices() {
    return this.pricesService.updateHoldingPrices();
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
  async getPrice(
    @Param('symbol') symbol: string,
    @Query('forceRefresh') forceRefresh?: string
  ) {
    const force = forceRefresh === 'true' || forceRefresh === '1';
    const price = await this.pricesService.getPrice(symbol, 0, force);
    return { symbol, price };
  }

  @Get('symbols/:type')
  @ApiOperation({ summary: 'Obtener símbolos disponibles por tipo (crypto o equity). Si se proporciona query, busca en APIs externas.' })
  @ApiResponse({ status: 200, description: 'Lista de símbolos disponibles' })
  async getSymbols(
    @Param('type') type: string,
    @Query('query') query?: string
  ) {
    return this.pricesService.getAvailableSymbols(type.toLowerCase(), query);
  }
}

