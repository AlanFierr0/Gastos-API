import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ExchangeRatesService, ExchangeRate } from './exchange-rates.service';

@ApiTags('exchange-rates')
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current exchange rates (USD Official, Blue, MEP, CCL)' })
  @ApiResponse({ status: 200, description: 'Exchange rates retrieved successfully' })
  async getExchangeRates(): Promise<ExchangeRate[]> {
    return this.exchangeRatesService.getExchangeRates();
  }

  @Get('history')
  @ApiOperation({ summary: 'Get historical exchange rates' })
  @ApiQuery({ name: 'code', required: false, description: 'Filter by rate code (USD_OFICIAL, USD_BLUE)' })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year', type: Number })
  @ApiResponse({ status: 200, description: 'Historical exchange rates retrieved successfully' })
  async getHistoricalRates(
    @Query('code') code?: string,
    @Query('year') year?: number,
  ) {
    const yearNum = year ? Number(year) : undefined;
    return this.exchangeRatesService.getHistoricalRates(code, yearNum);
  }
}

