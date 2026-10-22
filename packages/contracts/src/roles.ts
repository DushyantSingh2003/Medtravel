import { z } from 'zod';

/**
 * The eleven roles of PRD section 2. The permission matrix (what each role may do) arrives with
 * F-04; this file only says who exists and which portal each role lives in.
 */
export const ROLES = [
  'patient',
  'attendant',
  'agent',
  'case_manager',
  'ground_coordinator',
  'interpreter',
  'medical_reviewer',
  'hospital_desk',
  'doctor',
  'finance',
  'super_admin',
] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** The five portals. The coordinator portal is `ops`, and its URL segment is `/ops`. */
export const PORTALS = ['patient', 'ops', 'hospital', 'agent', 'admin'] as const;
export const portalSchema = z.enum(PORTALS);
export type Portal = z.infer<typeof portalSchema>;

const PORTAL_OF_ROLE: Record<Role, Portal> = {
  patient: 'patient',
  attendant: 'patient',
  agent: 'agent',
  case_manager: 'ops',
  ground_coordinator: 'ops',
  interpreter: 'ops',
  medical_reviewer: 'ops',
  hospital_desk: 'hospital',
  doctor: 'hospital',
  finance: 'admin',
  super_admin: 'admin',
};

/** The portal a role signs in to, and where the post-login redirect sends them. */
export const portalOfRole = (role: Role): Portal => PORTAL_OF_ROLE[role];

export const isRole = (value: unknown): value is Role => roleSchema.safeParse(value).success;
export const isPortal = (value: unknown): value is Portal => portalSchema.safeParse(value).success;
