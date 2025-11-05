import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

export interface ExchangeRate {
  name: string;
  code: string;
  buy: number;
  sell: number;
  lastUpdate: string;
}

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly DOLLAR_API_URL = 'https://api.bluelytics.com.ar/v2/latest';
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache
  private cache: {
    data: ExchangeRate[];
    timestamp: number;
  } | null = null;

  constructor(private prisma: PrismaService) {}

  async getExchangeRates(): Promise<ExchangeRate[]> {
    // Return cached data if still valid
    if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_DURATION) {
      this.logger.log('Returning cached exchange rates');
      return this.cache.data;
    }

    try {
      const response = await axios.get(this.DOLLAR_API_URL, {
        timeout: 5000,
      });

      const data = response.data;
      const rates: ExchangeRate[] = [];

      // Dólar Oficial
      if (data.oficial) {
        rates.push({
          name: 'Dólar Oficial',
          code: 'USD_OFICIAL',
          buy: data.oficial.value_buy || 0,
          sell: data.oficial.value_sell || 0,
          lastUpdate: data.oficial.last_update || new Date().toISOString(),
        });
      }

      // Dólar Blue
      if (data.blue) {
        rates.push({
          name: 'Dólar Blue',
          code: 'USD_BLUE',
          buy: data.blue.value_buy || 0,
          sell: data.blue.value_sell || 0,
          lastUpdate: data.blue.last_update || new Date().toISOString(),
        });
      }

      // Dólar MEP (Mercado Electrónico de Pagos)
      if (data.mep) {
        rates.push({
          name: 'Dólar MEP',
          code: 'USD_MEP',
          buy: data.mep.value_buy || 0,
          sell: data.mep.value_sell || 0,
          lastUpdate: data.mep.last_update || new Date().toISOString(),
        });
      }

      // Dólar CCL (Contado con Liquidación)
      if (data.ccl) {
        rates.push({
          name: 'Dólar CCL',
          code: 'USD_CCL',
          buy: data.ccl.value_buy || 0,
          sell: data.ccl.value_sell || 0,
          lastUpdate: data.ccl.last_update || new Date().toISOString(),
        });
      }

      // Update cache
      this.cache = {
        data: rates,
        timestamp: Date.now(),
      };

      // Save historical data (once per month)
      await this.saveHistoricalData(rates);

      this.logger.log(`Successfully fetched ${rates.length} exchange rates`);
      return rates;
    } catch (error) {
      this.logger.error('Failed to fetch exchange rates:', error.message);
      
      // Return cached data if available, even if expired
      if (this.cache) {
        this.logger.warn('Returning stale cached data due to API error');
        return this.cache.data;
      }

      // Return default/fallback rates if no cache
      return this.getDefaultRates();
    }
  }

  private getDefaultRates(): ExchangeRate[] {
    return [
      {
        name: 'Dólar Oficial',
        code: 'USD_OFICIAL',
        buy: 0,
        sell: 0,
        lastUpdate: new Date().toISOString(),
      },
      {
        name: 'Dólar Blue',
        code: 'USD_BLUE',
        buy: 0,
        sell: 0,
        lastUpdate: new Date().toISOString(),
      },
    ];
  }

  private async saveHistoricalData(rates: ExchangeRate[]) {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // 1-12

      for (const rate of rates) {
        // Only save Oficial and Blue
        if (rate.code !== 'USD_OFICIAL' && rate.code !== 'USD_BLUE') continue;
        if (rate.buy === 0 || rate.sell === 0) continue;

        await this.prisma.exchangeRateHistory.upsert({
          where: {
            code_year_month: {
              code: rate.code,
              year,
              month,
            },
          },
          update: {
            buy: rate.buy,
            sell: rate.sell,
            name: rate.name,
            updatedAt: new Date(),
          },
          create: {
            code: rate.code,
            name: rate.name,
            buy: rate.buy,
            sell: rate.sell,
            year,
            month,
          },
        });
      }

      this.logger.log(`Saved historical exchange rates for ${year}-${month}`);
    } catch (error) {
      this.logger.error('Failed to save historical data:', error.message);
    }
  }

  async getHistoricalRates(code?: string, year?: number): Promise<any[]> {
    try {
      const where: any = {};
      if (code) where.code = code;
      if (year) where.year = year;

      const history = await this.prisma.exchangeRateHistory.findMany({
        where,
        orderBy: [
          { year: 'desc' },
          { month: 'desc' },
        ],
      });

      return history.map((h) => ({
        id: h.id,
        code: h.code,
        name: h.name,
        buy: h.buy,
        sell: h.sell,
        year: h.year,
        month: h.month,
        createdAt: h.createdAt.toISOString(),
        updatedAt: h.updatedAt.toISOString(),
      }));
    } catch (error) {
      this.logger.error('Failed to get historical rates:', error.message);
      return [];
    }
  }

  async convertCurrency(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return amount;
    
    const rates = await this.getExchangeRates();
    
    // Convert to ARS first if needed
    let amountInARS = amount;
    if (fromCurrency === 'USD') {
      const blueRate = rates.find(r => r.code === 'USD_BLUE');
      if (blueRate) {
        amountInARS = amount * blueRate.sell; // Use sell price for conversion
      }
    }

    // Convert from ARS to target currency
    if (toCurrency === 'USD') {
      const blueRate = rates.find(r => r.code === 'USD_BLUE');
      if (blueRate) {
        return amountInARS / blueRate.buy; // Use buy price for conversion
      }
    }

    return amountInARS; // Default: return in ARS
  }
}

