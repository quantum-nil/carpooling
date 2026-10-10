import { z } from 'zod';

const identifier = z.string().trim().min(1).max(200);

export const earnPointsSchema = z.object({
  ruleCode: identifier,
  referenceId: identifier,
  idempotencyKey: identifier,
  amount: z.number().finite().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const redeemPointsSchema = z.object({
  ruleCode: identifier,
  points: z.number().int().positive(),
  referenceId: identifier,
  idempotencyKey: identifier,
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const earningRuleSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  basis: z.enum(['FIXED', 'PER_CURRENCY_UNIT']),
  fixedPoints: z.number().int().positive().optional(),
  pointsPerUnit: z.number().finite().positive().optional(),
  minimumAmount: z.number().finite().nonnegative().optional(),
  maximumPoints: z.number().int().positive().optional(),
  active: z.boolean().default(true),
}).strict().superRefine((value, context) => {
  if (value.basis === 'FIXED' && value.fixedPoints === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedPoints'], message: 'Fixed rules require fixedPoints' });
  if (value.basis === 'PER_CURRENCY_UNIT' && value.pointsPerUnit === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['pointsPerUnit'], message: 'Currency rules require pointsPerUnit' });
});

export const redemptionRuleSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  pointsPerUnit: z.number().int().positive(),
  valueMinorPerUnit: z.number().int().positive(),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
  minimumPoints: z.number().int().positive(),
  maximumPoints: z.number().int().positive().optional(),
  active: z.boolean().default(true),
}).strict().refine((value) => value.maximumPoints === undefined || value.maximumPoints >= value.minimumPoints, { path: ['maximumPoints'], message: 'Maximum points must be at least the minimum' });

export type EarnPointsInput = z.infer<typeof earnPointsSchema>;
export type RedeemPointsInput = z.infer<typeof redeemPointsSchema>;
export type EarningRuleInput = z.infer<typeof earningRuleSchema>;
export type RedemptionRuleInput = z.infer<typeof redemptionRuleSchema>;
