import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import { money, type FxConverted, type FxRates } from '@medtravel/contracts';
import { RateUnavailableError, activeCurrencyCodes, convert, rateOn } from '@medtravel/fx';
import { PRISMA } from '../../database/database.module.js';

@Injectable()
export class FxService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** What one unit of `base` buys in every active currency we hold a recent rate for. */
  async rates(base: string): Promise<FxRates> {
    const codes = (await activeCurrencyCodes(this.prisma)).filter((code) => code !== base);
    const now = new Date();
    const found = await Promise.all(
      codes.map(async (code) => {
        const rate = await rateOn(this.prisma, base, code, now).catch((error: unknown) => {
          if (error instanceof RateUnavailableError) return null;
          throw error;
        });
        return rate ? ([code, rate] as const) : null;
      }),
    );
    const available = found.filter((entry) => entry !== null);
    if (available.length === 0) throw new BadRequestException(`No exchange rates for ${base}`);
    const oldest = available.reduce((min, [, rate]) => (rate.asOf < min ? rate.asOf : min), now);
    return {
      base,
      asOf: oldest.toISOString(),
      rates: Object.fromEntries(available.map(([code, rate]) => [code, rate.rate])),
    };
  }

  async convert(input: {
    amountMinor: number;
    from: string;
    to: string;
    date?: string;
  }): Promise<FxConverted> {
    const date = input.date ? new Date(`${input.date}T23:59:59.999Z`) : new Date();
    try {
      const { money: converted, rate } = await convert(
        this.prisma,
        money(input.amountMinor, input.from),
        input.to,
        date,
      );
      return {
        from: money(input.amountMinor, input.from),
        to: converted,
        rate: rate.rate,
        asOf: rate.asOf.toISOString(),
        source: rate.source,
      };
    } catch (error) {
      if (error instanceof RateUnavailableError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
