import { z } from 'zod';

export const PLATFORM_NOTE_ID_PATTERN = /^[0-9a-f]{24}$/;

export const platformNoteIdSchema = z.string()
  .trim()
  .toLowerCase()
  .regex(PLATFORM_NOTE_ID_PATTERN, '笔记 ID 必须是 24 位十六进制字符');

export const optionalPlatformNoteIdSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  platformNoteIdSchema.nullable(),
);

export const platformNoteIdFromForm = (form: FormData) => form.get('platformNoteId');
