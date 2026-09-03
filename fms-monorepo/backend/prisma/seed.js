import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
if (process.env.NODE_ENV !== "development") {
  console.error("Development seed refused: NODE_ENV must be development.");
  process.exit(1);
}

const financePassword = process.env.DEV_SEED_FINANCE_PASSWORD;
const userPassword = process.env.DEV_SEED_USER_PASSWORD;
if (!financePassword || financePassword.length < 12 || !userPassword || userPassword.length < 12) {
  console.error("DEV_SEED_FINANCE_PASSWORD and DEV_SEED_USER_PASSWORD must each contain at least 12 characters.");
  process.exit(1);
}

const users = [
  { name: "Fatima Finance", email: "finance.head@fms.local", role: "FINANCE_HEAD", branch: null, password: financePassword },
  { name: "Ahmed Accounts", email: "accounts.head@fms.local", role: "ACCOUNTS_HEAD", branch: null },
  { name: "Bilal Manager", email: "branch.manager@fms.local", role: "BRANCH_MANAGER", branch: "MB01" },
  { name: "Dania Operator", email: "data.entry@fms.local", role: "DATA_ENTRY_OPERATOR", branch: "MB01" },
  { name: "Sara Officer", email: "program.officer@fms.local", role: "PROGRAM_OFFICER", branch: "NB01" },
  { name: "Umar Auditor", email: "auditor@fms.local", role: "AUDITOR", branch: null },
];

async function main() {
  const mainBranch = await prisma.branch.upsert({
    where: { code: "MB01" }, update: { name: "Main Branch", isActive: true },
    create: { name: "Main Branch", code: "MB01" },
  });
  const northBranch = await prisma.branch.upsert({
    where: { code: "NB01" }, update: { name: "North Branch", isActive: true },
    create: { name: "North Branch", code: "NB01" },
  });
  const branches = { MB01: mainBranch.id, NB01: northBranch.id };

  for (const category of [
    { name: "Travel", budgetCap: 50000 }, { name: "Utilities", budgetCap: 30000 },
    { name: "Supplies", budgetCap: 25000 }, { name: "Misc", budgetCap: 15000 },
  ]) {
    await prisma.expenseCategory.upsert({ where: { name: category.name }, update: category, create: category });
  }

  for (const user of users) {
    const plainPassword = user.password ?? userPassword;
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const data = { name: user.name, role: user.role, passwordHash, isActive: true, branchId: user.branch ? branches[user.branch] : null };
    await prisma.user.upsert({ where: { email: user.email }, update: data, create: { ...data, email: user.email } });
  }

  console.log("\nSeed complete. Development users:");
  for (const user of users) console.log(`${user.role.padEnd(20)} ${user.email.padEnd(32)} ${user.password ?? userPassword}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
