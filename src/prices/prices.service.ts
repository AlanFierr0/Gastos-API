import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene los símbolos únicos de crypto y equity desde las inversiones
   */
  async getSymbolsFromInvestments() {
    const investments = await this.prisma.investment.findMany({
      include: {
        category: {
          include: {
            type: true,
          },
        },
      },
    });

    const cryptoSymbols = new Set<string>();
    const equitySymbols = new Set<string>();

    investments.forEach((inv) => {
      const concept = inv.concept?.toUpperCase().trim();
      if (!concept) return;

      const typeName = inv.category?.type?.name?.toLowerCase();
      if (typeName === 'crypto') {
        cryptoSymbols.add(concept);
      } else if (typeName === 'equity') {
        equitySymbols.add(concept);
      }
    });

    return {
      crypto: Array.from(cryptoSymbols),
      equity: Array.from(equitySymbols),
    };
  }

  /**
   * Obtiene precios de cryptos desde CoinGecko
   */
  async fetchCryptoPrices(symbols: string[]): Promise<Map<string, number>> {
    if (symbols.length === 0) return new Map();

    const prices = new Map<string, number>();

    try {
      // Mapeo de símbolos comunes a IDs de CoinGecko
      // Si el símbolo no está en el mapeo, se intenta usar el símbolo en minúsculas como ID
      const symbolToId: Record<string, string> = {
        BTC: 'bitcoin',
        ETH: 'ethereum',
        BNB: 'binancecoin',
        SOL: 'solana',
        ADA: 'cardano',
        XRP: 'ripple',
        DOGE: 'dogecoin',
        DOT: 'polkadot',
        MATIC: 'matic-network',
        AVAX: 'avalanche-2',
        LINK: 'chainlink',
        UNI: 'uniswap',
        LTC: 'litecoin',
        ATOM: 'cosmos',
        ETC: 'ethereum-classic',
        XLM: 'stellar',
        ALGO: 'algorand',
        VET: 'vechain',
        FIL: 'filecoin',
        TRX: 'tron',
        USDT: 'tether',
        USDC: 'usd-coin',
        DAI: 'dai',
        BUSD: 'binance-usd',
        SHIB: 'shiba-inu',
        AAVE: 'aave',
        MKR: 'maker',
        COMP: 'compound-governance-token',
        SNX: 'havven',
        CRV: 'curve-dao-token',
        YFI: 'yearn-finance',
        SUSHI: 'sushi',
        // Agregar más según necesidad
      };

      const ids: string[] = [];
      const symbolMap = new Map<string, string>(); // CoinGecko ID -> Symbol

      symbols.forEach((symbol) => {
        const id = symbolToId[symbol] || symbol.toLowerCase();
        ids.push(id);
        symbolMap.set(id, symbol);
      });

      if (ids.length === 0) return prices;

      // CoinGecko permite hasta 250 IDs por request
      const batchSize = 250;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const idsParam = batch.join(',');
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;

        try {
          const response = await fetch(url);
          if (!response.ok) {
            this.logger.error(`Error fetching crypto prices: ${response.statusText}`);
            continue;
          }

          const data = await response.json();

          for (const [id, priceData] of Object.entries(data)) {
            const symbol = symbolMap.get(id);
            if (symbol && priceData && typeof priceData === 'object' && 'usd' in priceData) {
              prices.set(symbol, Number(priceData.usd));
            }
          }

          // Rate limiting: CoinGecko permite 10-50 requests/minuto
          if (i + batchSize < ids.length) {
            await new Promise((resolve) => setTimeout(resolve, 1200)); // ~1.2 segundos entre requests
          }
        } catch (error) {
          this.logger.error(`Error fetching crypto batch: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error in fetchCryptoPrices: ${error.message}`);
    }

    return prices;
  }

  /**
   * Obtiene precios de equities desde Yahoo Finance
   */
  async fetchEquityPrices(symbols: string[]): Promise<Map<string, number>> {
    if (symbols.length === 0) return new Map();

    const prices = new Map<string, number>();

    try {
      // Procesar en batches para evitar rate limiting
      const batchSize = 10;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (symbol) => {
            try {
              const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
              const response = await fetch(url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
              });

              if (!response.ok) {
                this.logger.warn(`Error fetching equity price for ${symbol}: ${response.statusText}`);
                return;
              }

              const data = await response.json();
              const result = data?.chart?.result?.[0];

              if (result?.meta?.regularMarketPrice) {
                const price = Number(result.meta.regularMarketPrice);
                if (!isNaN(price) && price > 0) {
                  prices.set(symbol, price);
                }
              } else {
                this.logger.warn(`No price data found for ${symbol}`);
              }
            } catch (error) {
              this.logger.error(`Error fetching equity price for ${symbol}: ${error.message}`);
            }
          })
        );

        // Rate limiting: esperar entre batches
        if (i + batchSize < symbols.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      this.logger.error(`Error in fetchEquityPrices: ${error.message}`);
    }

    return prices;
  }

  /**
   * Guarda o actualiza precios en la base de datos
   */
  async savePrices(
    cryptoPrices: Map<string, number>,
    equityPrices: Map<string, number>
  ): Promise<{ saved: number; errors: number }> {
    let saved = 0;
    let errors = 0;

    // Guardar precios de crypto
    for (const [symbol, price] of cryptoPrices.entries()) {
      try {
        const normalizedSymbol = symbol.toUpperCase().trim();
        await this.prisma.price.upsert({
          where: { symbol: normalizedSymbol },
          update: {
            price,
            type: 'crypto',
            source: 'coingecko',
            updatedAt: new Date(),
          },
          create: {
            symbol: normalizedSymbol,
            price,
            type: 'crypto',
            source: 'coingecko',
          },
        });
        this.logger.debug(`Saved crypto price for ${normalizedSymbol}: ${price}`);
        saved++;
      } catch (error) {
        this.logger.error(`Error saving crypto price for ${symbol}: ${error.message}`);
        errors++;
      }
    }

    // Guardar precios de equity
    for (const [symbol, price] of equityPrices.entries()) {
      try {
        const normalizedSymbol = symbol.toUpperCase().trim();
        await this.prisma.price.upsert({
          where: { symbol: normalizedSymbol },
          update: {
            price,
            type: 'equity',
            source: 'yahoo',
            updatedAt: new Date(),
          },
          create: {
            symbol: normalizedSymbol,
            price,
            type: 'equity',
            source: 'yahoo',
          },
        });
        this.logger.debug(`Saved equity price for ${normalizedSymbol}: ${price}`);
        saved++;
      } catch (error) {
        this.logger.error(`Error saving equity price for ${symbol}: ${error.message}`);
        errors++;
      }
    }

    return { saved, errors };
  }

  /**
   * Actualiza todos los precios desde las APIs
   */
  async updateAllPrices(): Promise<{ saved: number; errors: number; crypto: number; equity: number; investmentsUpdated: number }> {
    this.logger.log('Starting price update...');

    const { crypto: cryptoSymbols, equity: equitySymbols } = await this.getSymbolsFromInvestments();

    this.logger.log(`Found ${cryptoSymbols.length} crypto symbols and ${equitySymbols.length} equity symbols`);

    const [cryptoPrices, equityPrices] = await Promise.all([
      this.fetchCryptoPrices(cryptoSymbols),
      this.fetchEquityPrices(equitySymbols),
    ]);

    this.logger.log(`Fetched ${cryptoPrices.size} crypto prices and ${equityPrices.size} equity prices`);

    const { saved, errors } = await this.savePrices(cryptoPrices, equityPrices);

    this.logger.log(`Price update completed: ${saved} saved, ${errors} errors`);

    // Actualizar automáticamente los precios de las inversiones
    this.logger.log('Updating investment prices...');
    const { updated: investmentsUpdated } = await this.updateInvestmentPrices();
    this.logger.log(`Updated ${investmentsUpdated} investment prices`);

    return {
      saved,
      errors,
      crypto: cryptoPrices.size,
      equity: equityPrices.size,
      investmentsUpdated,
    };
  }

  /**
   * Obtiene el precio actual de un símbolo
   */
  async getPrice(symbol: string): Promise<number | null> {
    const price = await this.prisma.price.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });

    return price?.price || null;
  }

  /**
   * Obtiene todos los precios
   */
  async getAllPrices() {
    return this.prisma.price.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Actualiza el precio actual de una inversión basado en el precio guardado
   */
  async updateInvestmentPrices(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    try {
      const investments = await this.prisma.investment.findMany({
        include: {
          category: {
            include: {
              type: true,
            },
          },
        },
      });

      for (const inv of investments) {
        const concept = inv.concept?.toUpperCase().trim();
        if (!concept) {
          this.logger.warn(`Investment ${inv.id} has no concept, skipping`);
          continue;
        }

        const typeName = inv.category?.type?.name?.toLowerCase();
        if (typeName !== 'crypto' && typeName !== 'equity') {
          this.logger.debug(`Investment ${inv.id} (${concept}) is type ${typeName}, skipping`);
          continue;
        }

        try {
          const price = await this.getPrice(concept);
          this.logger.debug(`Looking for price of ${concept}: ${price}`);
          if (price && price > 0) {
            await this.prisma.investment.update({
              where: { id: inv.id },
              data: { currentPrice: price },
            });
            this.logger.log(`Updated investment ${inv.id} (${concept}) with price ${price}`);
            updated++;
          } else {
            this.logger.warn(`No price found for ${concept} or price is 0`);
          }
        } catch (error) {
          this.logger.error(`Error updating price for investment ${inv.id}: ${error.message}`);
          errors++;
        }
      }
    } catch (error) {
      this.logger.error(`Error in updateInvestmentPrices: ${error.message}`);
      errors++;
    }

    return { updated, errors };
  }
}

