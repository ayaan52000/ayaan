import { z } from "zod";

const weakProductionSecrets = new Set([
  "change-this-development-secret-before-deployment",
  "replace-with-a-long-random-secret",
  "generate_a_unique_random_secret_of_at_least_32_characters",
]);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url(),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  BUDGET_ENFORCEMENT: z.enum(["warn", "block", "off"]).default("warn"),
  EMAIL_NOTIFICATIONS_ENABLED: z.enum(["true", "false"]).default("false"),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_SECRET_KEY: z.string().min(1).optional(),
  STORAGE_REGION: z.string().min(1).default("us-east-1"),
  STORAGE_ENDPOINT: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
}).superRefine((value, context) => {
  if (value.STORAGE_PROVIDER === "s3") {
    for (const field of ["STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"]) {
      if (!value[field]) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required for S3-compatible storage.` });
    }
  }
  if (value.NODE_ENV !== "production") return;

  const normalizedSecret = value.JWT_SECRET.trim().toLowerCase();
  const containsPlaceholder = /(required|change[_-]?me|replace|generate|example|default|development)/i.test(value.JWT_SECRET);
  if (value.JWT_SECRET.length < 48 || weakProductionSecrets.has(normalizedSecret) || containsPlaceholder || new Set(value.JWT_SECRET).size < 16) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_SECRET"],
      message: "Production JWT_SECRET must be a unique, random value with at least 48 characters.",
    });
  }
  if (value.COOKIE_SECURE !== "true") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["COOKIE_SECURE"], message: "COOKIE_SECURE must be true in production." });
  }
  if (!value.FRONTEND_URL.startsWith("https://")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["FRONTEND_URL"], message: "FRONTEND_URL must use HTTPS in production." });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
