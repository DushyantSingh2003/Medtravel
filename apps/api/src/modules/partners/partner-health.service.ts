import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import { EXPIRY_WINDOW_DAYS, type PartnerHealth } from '@medtravel/contracts';
import { PRISMA } from '../../database/database.module.js';

const MONTHS = 6;
const DAY = 86_400_000;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const startOfToday = (): Date => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

/** The last `count` calendar months, oldest first, as `YYYY-MM`. */
export function lastMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

interface MonthRow {
  hospitalId: string;
  month: string;
  requests: bigint;
  answered: bigint;
  avgHours: number | null;
}

/** What needs attention across partners: expiring accreditations and agreements, and how fast hospitals answer. */
@Injectable()
export class PartnerHealthService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async health(): Promise<PartnerHealth> {
    const today = startOfToday();
    const horizon = new Date(today.getTime() + EXPIRY_WINDOW_DAYS * DAY);
    const live: Prisma.HospitalWhereInput = {
      deletedAt: null,
      status: { in: ['approved', 'published', 'unpublished'] },
    };

    const [accreditations, agreements] = await Promise.all([
      this.prisma.accreditation.findMany({
        where: { deletedAt: null, expiresAt: { not: null, lte: horizon }, hospital: live },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: 200,
        select: {
          id: true,
          body: true,
          expiresAt: true,
          hospital: { select: { id: true, name: true } },
        },
      }),
      this.prisma.hospital.findMany({
        where: { ...live, agreementEndsOn: { not: null, lte: horizon } },
        orderBy: [{ agreementEndsOn: 'asc' }, { id: 'asc' }],
        take: 200,
        select: { id: true, name: true, agreementEndsOn: true },
      }),
    ]);

    const months = lastMonths(new Date(), MONTHS);
    const since = new Date(`${months[0]}-01T00:00:00.000Z`);
    const stats = await this.prisma.$queryRaw<MonthRow[]>`
      SELECT "hospitalId",
             to_char("sentAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
             count(*) AS requests,
             count("respondedAt") AS answered,
             avg(extract(epoch FROM ("respondedAt" - "sentAt")) / 3600.0)
               FILTER (WHERE "respondedAt" IS NOT NULL) AS "avgHours"
      FROM "OpinionRequest"
      WHERE "deletedAt" IS NULL AND "sentAt" IS NOT NULL AND "sentAt" >= ${since}
      GROUP BY 1, 2`;
    const names = await this.prisma.hospital.findMany({
      where: { id: { in: [...new Set(stats.map((s) => s.hospitalId))] }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return {
      accreditationExpiries: accreditations.flatMap((a) =>
        a.expiresAt
          ? [
              {
                hospitalId: a.hospital.id,
                hospitalName: a.hospital.name,
                accreditationId: a.id,
                body: a.body,
                expiresAt: dayText(a.expiresAt),
                daysLeft: Math.round((a.expiresAt.getTime() - today.getTime()) / DAY),
              },
            ]
          : [],
      ),
      agreementExpiries: agreements.flatMap((h) =>
        h.agreementEndsOn
          ? [
              {
                hospitalId: h.id,
                hospitalName: h.name,
                endsOn: dayText(h.agreementEndsOn),
                daysLeft: Math.round((h.agreementEndsOn.getTime() - today.getTime()) / DAY),
              },
            ]
          : [],
      ),
      responseTimes: names.map((hospital) => ({
        hospitalId: hospital.id,
        hospitalName: hospital.name,
        months: months.map((month) => {
          const row = stats.find((s) => s.hospitalId === hospital.id && s.month === month);
          return {
            month,
            requests: Number(row?.requests ?? 0n),
            answered: Number(row?.answered ?? 0n),
            avgHours: row?.avgHours === null || row === undefined ? null : Math.round(Number(row.avgHours) * 10) / 10,
          };
        }),
      })),
    };
  }
}
