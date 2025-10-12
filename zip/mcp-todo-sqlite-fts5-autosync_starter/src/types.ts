import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  body: z.string().default(''),
  state: z.enum(['open','in_review','done','archived']).default('open'),
  priority: z.number().int().default(0),
  parent_id: z.string().optional().nullable(),
  reviewer: z.string().optional().nullable(),
  assignee: z.string().optional().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  archived_at: z.number().int().nullable().optional(),
  vclock: z.number().int().default(0),
  meta: z.any().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const PatchOpSchema = z.object({
  op: z.enum(['set','replace','delete']),
  path: z.string(),     // e.g. "/title", "/meta/foo"
  value: z.any().optional(),
});

export type PatchOp = z.infer<typeof PatchOpSchema>;
