import { z } from 'zod';

export const notificationQuerySchema = z.object({
  // Sorgu dizesinden her şey metin geliyor; "false" da bir metin ve
  // truthy — coerce.boolean() bunu true'ya çevirirdi.
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((deger) => deger === 'true'),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
