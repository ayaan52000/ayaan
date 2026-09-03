import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { safeOriginalName, scanReceiptForMalware, validateReceiptFile } from "../src/lib/receiptSafety.js";
import { deleteReceipt, uploadReceipt } from "../src/lib/storage.js";

const prisma = new PrismaClient();
const legacyRoot = path.resolve(process.env.LEGACY_UPLOAD_DIR || "uploads");

async function main() {
  const expenses = await prisma.expense.findMany({ where: { receiptKey: { startsWith: "/uploads/" } }, select: { id: true, branchId: true, receiptKey: true } });
  console.log(`Found ${expenses.length} legacy receipt(s). Source directory: ${legacyRoot}`);

  for (const expense of expenses) {
    const originalName = safeOriginalName(path.basename(expense.receiptKey));
    const source = path.resolve(legacyRoot, originalName);
    if (path.dirname(source) !== legacyRoot) throw new Error(`Unsafe legacy path for expense ${expense.id}`);

    const buffer = await readFile(source);
    const verified = await validateReceiptFile({ buffer, originalName, declaredMimeType: null });
    const scan = await scanReceiptForMalware({ buffer, contentType: verified.contentType, name: originalName });
    if (!scan.clean) throw new Error(`Receipt for expense ${expense.id} failed malware scanning`);

    const newKey = `${expense.branchId}/${expense.id}/${randomUUID()}-${originalName}`;
    await uploadReceipt({ key: newKey, buffer, contentType: verified.contentType });
    try {
      const updated = await prisma.expense.updateMany({ where: { id: expense.id, receiptKey: expense.receiptKey }, data: { receiptKey: newKey } });
      if (updated.count !== 1) {
        await deleteReceipt(newKey);
        console.log(`Skipped ${expense.id}; it was migrated by another process.`);
        continue;
      }
    } catch (error) {
      await deleteReceipt(newKey).catch(() => {});
      throw error;
    }
    console.log(`Migrated expense ${expense.id} -> ${newKey}`);
  }

  console.log("Legacy receipt migration complete. Original files were retained for backup and can be removed manually after verification.");
}

main()
  .catch((error) => { console.error("Legacy receipt migration failed:", error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
