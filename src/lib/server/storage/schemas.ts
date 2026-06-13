import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 26_214_400;

export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain'
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

const contentTypeSchema = z.enum(ALLOWED_CONTENT_TYPES);

export const presignPutRequestSchema = z
  .object({
    item_id: z.string().uuid().nullable(),
    section_code: z.string().nullable(),
    filename: z.string().min(1).max(255),
    content_type: contentTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    kind: z.enum(['photo', 'export'])
  })
  .superRefine((data, ctx) => {
    if (data.item_id && !data.section_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'section_code requerido cuando item_id está presente',
        path: ['section_code']
      });
    }
  });

export const confirmUploadSchema = z.object({
  item_id: z.string().uuid().nullable(),
  r2_key: z.string().min(1),
  filename: z.string().min(1).max(255),
  content_type: contentTypeSchema,
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  kind: z.enum(['photo', 'export'])
});

export const deleteAttachmentSchema = z.object({
  item_id: z.string().uuid(),
  row_id: z.string().uuid().optional()
});

export const fileRefValueSchema = z.object({
  attachment_ids: z.array(z.string().uuid())
});
