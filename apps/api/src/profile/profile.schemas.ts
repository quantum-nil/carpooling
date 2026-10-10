import { z } from 'zod';

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).nullable().optional(),
    phoneNumber: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one profile field is required' });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
