import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url(),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  BUDGET_ENFORCEMENT: z.enum(["warn", "block", "off"]).default("warn"),
  EMAIL_NOTIFICATIONS_ENABLED: z.enum(["true", "false"]).default("false"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
