import { z } from 'zod';
import { roleSchema, type Role } from './roles.js';
import { userStatusSchema } from './enums.js';
import { cursorPageSchema, cursorQuerySchema } from './primitives.js';

/** Roles an admin can give to a staff member. Hospital, agent and patient accounts are managed elsewhere. */
export const STAFF_ROLES = [
  'case_manager',
  'ground_coordinator',
  'interpreter',
  'medical_reviewer',
  'finance',
  'super_admin',
] as const satisfies readonly Role[];
export const staffRoleSchema = z.enum(STAFF_ROLES);

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time such as 09:30');
const interval = z
  .object({ from: time, to: time })
  .refine((v) => v.from < v.to, 'The end must be after the start');

/** When a person works: a time zone and, per weekday, up to three intervals that do not overlap. */
export const workingHoursSchema = z
  .object({
    timezone: z.string().min(1).max(64),
    days: z.partialRecord(z.enum(WEEKDAYS), z.array(interval).max(3)),
  })
  .superRefine((value, ctx) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value.timezone });
    } catch {
      ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Not a known time zone' });
    }
    for (const [day, list] of Object.entries(value.days)) {
      const sorted = [...(list ?? [])].sort((a, b) => a.from.localeCompare(b.from));
      sorted.forEach((item, i) => {
        const before = sorted[i - 1];
        if (before && before.to > item.from)
          ctx.addIssue({ code: 'custom', path: ['days', day], message: 'Intervals overlap' });
      });
    }
  });
export type WorkingHours = z.infer<typeof workingHoursSchema>;

const dateOnly = z.iso.date();
export const staffLeaveSchema = z.object({
  id: z.uuid(),
  startsOn: dateOnly,
  endsOn: dateOnly,
  note: z.string().max(200).nullable(),
});
export type StaffLeave = z.infer<typeof staffLeaveSchema>;
export const createLeaveSchema = z
  .object({ startsOn: dateOnly, endsOn: dateOnly, note: z.string().trim().max(200).optional() })
  .refine((v) => v.startsOn <= v.endsOn, {
    path: ['endsOn'],
    message: 'The last day cannot be before the first',
  });
export type CreateLeave = z.infer<typeof createLeaveSchema>;

// ---- users ----------------------------------------------------------------------------------------------------
export const userListQuerySchema = cursorQuerySchema.extend({
  q: z.string().trim().min(2).max(80).optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  teamId: z.uuid().optional(),
  cityId: z.uuid().optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const userRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().max(254).nullable(),
  role: roleSchema,
  status: userStatusSchema,
  twoFactorEnabled: z.boolean(),
  lastLoginAt: z.iso.datetime().nullable(),
  teamId: z.uuid().nullable(),
  teamName: z.string().max(80).nullable(),
  cityId: z.uuid().nullable(),
  onLeave: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type UserRow = z.infer<typeof userRowSchema>;
export const userPageSchema = cursorPageSchema(userRowSchema);

export const userDetailSchema = userRowSchema.extend({
  phone: z.string().max(20).nullable(),
  language: z.string(),
  timezone: z.string().max(64).nullable(),
  title: z.string().max(80).nullable(),
  languages: z.array(z.string()),
  managerId: z.uuid().nullable(),
  assignable: z.boolean(),
  maxOpenCases: z.number().int().nullable(),
  workingHours: workingHoursSchema.nullable(),
  leaves: z.array(staffLeaveSchema),
  hasStaffProfile: z.boolean(),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

export const updateUserSchema = z.strictObject({
  name: z.string().trim().min(2).max(120).optional(),
  role: staffRoleSchema.optional(),
  title: z.string().trim().max(80).nullable().optional(),
  languages: z
    .array(z.string().regex(/^[a-z]{2,3}$/))
    .max(10)
    .optional(),
  cityId: z.uuid().nullable().optional(),
  teamId: z.uuid().nullable().optional(),
  assignable: z.boolean().optional(),
  maxOpenCases: z.number().int().min(1).max(500).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  workingHours: workingHoursSchema.nullable().optional(),
});
export type UpdateUser = z.infer<typeof updateUserSchema>;

export const loginHistoryItemSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  at: z.iso.datetime(),
  ip: z.string().max(45).nullable(),
  userAgent: z.string().max(512).nullable(),
  method: z.string().max(20).nullable(),
});
export type LoginHistoryItem = z.infer<typeof loginHistoryItemSchema>;
export const loginHistoryPageSchema = cursorPageSchema(loginHistoryItemSchema);

// ---- teams ----------------------------------------------------------------------------------------------------
export const teamSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  managerId: z.uuid().nullable(),
  managerName: z.string().max(120).nullable(),
  memberCount: z.number().int(),
});
export type Team = z.infer<typeof teamSchema>;
export const teamListSchema = z.object({ items: z.array(teamSchema) });
export const teamWriteSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  managerId: z.uuid().nullable().optional(),
});
export type TeamWrite = z.infer<typeof teamWriteSchema>;

// ---- impersonation --------------------------------------------------------------------------------------------
/** The impersonation cookie lives this long; the session behind it must still be the admin's own. */
export const IMPERSONATION_MINUTES = 30;
/** Why an admin is looking at the product as someone else: kept in the audit trail. */
export const impersonateRequestSchema = z.strictObject({
  reason: z.string().trim().min(10, 'Say why, in at least 10 characters').max(300),
});
export type ImpersonateRequest = z.infer<typeof impersonateRequestSchema>;

export const impersonatingSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  role: roleSchema,
  expiresAt: z.iso.datetime(),
});
export type Impersonating = z.infer<typeof impersonatingSchema>;
