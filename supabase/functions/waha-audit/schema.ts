// Zod schema for waha-audit request body — exported so both the edge function
// and unit tests share the exact same validation rules.
import { z } from 'npm:zod@3.23.8';

export const BodySchema = z.object({
  owner_id: z.string().uuid({ message: 'owner_id must be uuid' }),
  message_id: z.string().min(1).max(200).nullish(),
  connection_id: z.string().uuid().nullish(),
  sub_company_id: z.string().uuid().nullish(),
  call_id: z.string().uuid().nullish(),
  wavoip_call_id: z.string().min(1).max(200).nullish(),
  limit: z.number().int().min(1).max(500).default(100),
  since_hours: z.number().int().min(1).max(24 * 30).default(24),
  order: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().datetime({ offset: true }).nullish(),
  gaps_only: z.boolean().optional(),
}).strict();

export type AuditRequestBody = z.infer<typeof BodySchema>;
