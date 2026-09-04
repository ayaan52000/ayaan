import { Prisma } from "@prisma/client";
import { notifyRole } from "./notify.js";

export async function fundTotals(client, fundId, branchId = null) {
  const fund = await client.fund.findUnique({ where: { id: fundId }, select: { totalAmount: true } });
  if (!fund) return null;
  const [advances, directExpenses, allocations] = await Promise.all([
    client.cashAdvance.aggregate({ _sum: { amount: true }, where: { fundId, status: { in: ["DISBURSED", "SETTLED"] }, ...(branchId ? { branchId } : {}) } }),
    client.expense.aggregate({ _sum: { amount: true }, where: { fundId, cashAdvanceId: null, status: "APPROVED", ...(branchId ? { branchId } : {}) } }),
    client.fundAllocation.aggregate({ _sum: { allocatedAmount: true }, where: { fundId, ...(branchId ? { branchId } : {}) } }),
  ]);
  const spent = new Prisma.Decimal(advances._sum.amount ?? 0).plus(directExpenses._sum.amount ?? 0);
  const allocated = new Prisma.Decimal(allocations._sum.allocatedAmount ?? 0);
  const ceiling = branchId ? allocated : new Prisma.Decimal(fund.totalAmount);
  return { totalAmount: fund.totalAmount, allocated, spent, remaining: ceiling.minus(spent) };
}

export async function notifyFundThreshold(client, fundId) {
  const totals = await fundTotals(client, fundId);
  if (!totals || totals.totalAmount.isZero() || totals.spent.dividedBy(totals.totalAmount).lt(0.9)) return;
  const existing = await client.notification.findFirst({ where: { type: "FUND_THRESHOLD", entityType: "Fund", entityId: fundId } });
  if (!existing) await notifyRole("FINANCE_HEAD", `Fund utilization has reached ${totals.spent.dividedBy(totals.totalAmount).times(100).toFixed(1)}%.`, "FUND_THRESHOLD", "Fund", fundId, null, client);
}
