import { z } from 'zod';
import { nonEmptyToken } from '../common/zod-validation.pipe';

const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);

export const registerSchema = z.object({ email, password }).strict();
export const loginSchema = z.object({ email, password }).strict();
export const passwordResetRequestSchema = z.object({ email }).strict();
export const passwordResetConfirmSchema = z
  .object({ token: nonEmptyToken, password })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
