import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  if (process.env.NODE_ENV !== "production") fail("Production seed refused: NODE_ENV must be production.");

  const email = process.env.PROD_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.PROD_ADMIN_NAME?.trim() || "Initial Finance Head";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("PROD_ADMIN_EMAIL must be a valid email address.");

  for (const rule of [
    { id: "default_cash_advance_level_1", entityType: "CASH_ADVANCE", level: 1, approverRole: "ACCOUNTS_HEAD" },
    { id: "default_cash_advance_level_2", entityType: "CASH_ADVANCE", level: 2, approverRole: "FINANCE_HEAD" },
    { id: "default_expense_level_1", entityType: "EXPENSE", level: 1, approverRole: "BRANCH_MANAGER" },
    { id: "default_expense_level_2", entityType: "EXPENSE", level: 2, approverRole: "ACCOUNTS_HEAD" },
  ]) await prisma.approvalRule.upsert({ where: { id: rule.id }, update: { ...rule, isActive: true }, create: rule });

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.log("Production Finance Head already exists; bootstrap seed skipped without changing its password.");
    return;
  }

  const password = `Fms!${randomBytes(24).toString("base64url")}9a`;
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await prisma.user.create({
      data: { name, email, passwordHash, role: "FINANCE_HEAD", branchId: null, isActive: true },
    });
  } catch (error) {
    if (error?.code === "P2002") {
      console.log("Production Finance Head was created concurrently; bootstrap seed skipped without changing its password.");
      return;
    }
    throw error;
  }

  console.log("\nINITIAL FINANCE HEAD CREATED");
  console.log(`Email: ${email}`);
  console.log(`One-time password: ${password}`);
  console.log("Store this password securely. Future seed runs will not print or replace it.\n");
}

main()
  .catch((error) => {
    console.error("Production seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
