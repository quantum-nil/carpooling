import { z } from 'zod';

const envBoolean = z.preprocess(
  (value: unknown) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return value;
  },
  z.boolean().default(false),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_ACCESS_TOKEN_TTL: z.string().default('15m'),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  DRIVER_LOCATION_STALE_SECONDS: z.coerce.number().int().positive().default(120),
  MATCHING_MAX_DISTANCE_KM: z.coerce.number().positive().default(25),
  MATCHING_DISTANCE_WEIGHT: z.coerce.number().nonnegative().default(1),
  MATCHING_ETA_WEIGHT: z.coerce.number().nonnegative().default(1),
  MATCHING_ROUTE_WEIGHT: z.coerce.number().nonnegative().default(1),
  MATCHING_OFFER_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RECURRING_RIDE_GENERATION_HORIZON_DAYS: z.coerce.number().int().positive().default(30),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  FCM_SERVER_KEY: z.string().min(1).optional(),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: envBoolean,
  DOCUMENT_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().max(900).default(600),
  DOCUMENT_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().max(900).default(300),
  EXOTEL_CALL_URL: z.string().url().optional(),
  EXOTEL_API_KEY: z.string().min(1).optional(),
  EXOTEL_API_TOKEN: z.string().min(1).optional(),
  EXOTEL_ACCOUNT_SID: z.string().min(1).optional(),
  EXOTEL_VIRTUAL_NUMBER: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  return envSchema.parse(config);
}
