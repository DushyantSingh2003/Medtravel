import { refreshRates, type FxProvider } from '@medtravel/fx';
import type { PrismaClient } from '@medtravel/db';

export const FX_QUEUE = 'fx';
export const FX_SCHEDULER_ID = 'fx-daily-refresh';
/** Rates are refreshed in India's morning (CLAUDE.md: ops run on Asia/Kolkata). */
export const FX_TIME_ZONE = 'Asia/Kolkata';

/** One refresh: fetch the active currencies against USD and store them. A failure throws, so the queue retries it. */
export async function runFxRefresh(deps: { prisma: PrismaClient; provider: FxProvider }) {
  return refreshRates(deps.prisma, deps.provider);
}

/** Whether the newest rate is older than a day (a new environment, or the job was down): refresh at start instead of waiting. */
export async function ratesAreStale(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<boolean> {
  const newest = await prisma.fxRate.findFirst({
    orderBy: { asOf: 'desc' },
    select: { asOf: true },
  });
  return !newest || now.getTime() - newest.asOf.getTime() > 24 * 3_600_000;
}
