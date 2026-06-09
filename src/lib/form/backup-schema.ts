import { z } from 'zod';

export const formBackupSchema = z.object({
  schema_version: z.literal('1.0'),
  audit_id: z.string().uuid(),
  exported_at: z.string().datetime(),
  responses: z.array(
    z.object({
      item_id: z.string().uuid(),
      value: z.unknown(),
      na: z.boolean().default(false),
      notes: z.string().nullable().optional()
    })
  )
});

export type FormBackup = z.infer<typeof formBackupSchema>;
