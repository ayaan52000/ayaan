import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import PDFDocument from "pdfkit";
import { fundTotals } from "../lib/funds.js";

const router = Router();
const localRoles = new Set(["BRANCH_MANAGER", "PROGRAM_OFFICER", "DATA_ENTRY_OPERATOR"]);
const rangeSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), branchId: z.string().min(1).optional() });
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (headers, rows) => [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
function sendCsv(res, filename, headers, rows) { res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` }); res.send(`\uFEFF${csv(headers, rows)}`); }
function filters(req, parsed) {
  const branchId = localRoles.has(req.user.role) ? req.user.branchId ?? "__no_branch__" : parsed.branchId;
  return { ...(branchId ? { branchId } : {}), ...(parsed.from || parsed.to ? { createdAt: { ...(parsed.from ? { gte: parsed.from } : {}), ...(parsed.to ? { lte: parsed.to } : {}) } } : {}) };
}

router.use(authenticate, requirePermission("VIEW_REPORTS"));
router.get("/cash-advances.csv", async (req, res, next) => { try { const parsed = rangeSchema.parse(req.query); const rows = await prisma.cashAdvance.findMany({ where: filters(req, parsed), include: { branch: true, requester: true }, orderBy: { createdAt: "desc" } }); sendCsv(res, "cash-advances.csv", ["ID", "Date", "Branch", "Requester", "Purpose", "Amount", "Status"], rows.map((item) => [item.id, item.createdAt.toISOString(), item.branch.name, item.requester.name, item.purpose, item.amount, item.status])); } catch (error) { next(error); } });
router.get("/expenses.csv", async (req, res, next) => { try { const parsed = rangeSchema.parse(req.query); const rows = await prisma.expense.findMany({ where: filters(req, parsed), include: { branch: true, creator: true, category: true }, orderBy: { createdAt: "desc" } }); sendCsv(res, "expenses.csv", ["ID", "Date", "Branch", "Creator", "Category", "Description", "Amount", "Status", "Receipt Access"], rows.map((item) => [item.id, item.createdAt.toISOString(), item.branch.name, item.creator.name, item.category.name, item.description, item.amount, item.status, `/api/expenses/${item.id}/receipt-url`])); } catch (error) { next(error); } });
router.get("/ledger.csv", async (req, res, next) => { try { const parsed = rangeSchema.parse(req.query); const where = filters(req, parsed); const rows = await prisma.ledgerEntry.findMany({ where, include: { branch: true, createdBy: true }, orderBy: { createdAt: "desc" } }); sendCsv(res, "ledger.csv", ["ID", "Date", "Branch", "Type", "Description", "Amount", "Running Balance", "Created By"], rows.map((item) => [item.id, item.createdAt.toISOString(), item.branch.name, item.type, item.description, item.amount, item.runningBalance, item.createdBy.name])); } catch (error) { next(error); } });

router.get("/branch-summary.pdf", requirePermission("VIEW_LEDGER"), async (_req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({ where: { isActive: true }, include: { ledgerEntries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 }, _count: { select: { cashAdvances: true, expenses: true } } }, orderBy: { name: "asc" } });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="branch-summary.pdf"' });
    const doc = new PDFDocument({ margin: 45, size: "A4" }); doc.pipe(res);
    doc.fontSize(20).fillColor("#332070").text("FMS Branch Summary"); doc.fontSize(9).fillColor("#666666").text(`Generated ${new Date().toLocaleString()}`).moveDown(1.5);
    doc.fontSize(9).fillColor("#ffffff").rect(45, doc.y, 505, 24).fill("#332070"); const y = doc.y + 7; doc.text("Branch", 53, y).text("Code", 230, y).text("Advances", 300, y).text("Expenses", 375, y).text("Balance", 455, y); doc.y += 28;
    for (const branch of branches) { if (doc.y > 740) doc.addPage(); const rowY = doc.y; doc.fillColor("#222222").text(branch.name, 53, rowY, { width: 165 }).text(branch.code, 230, rowY).text(String(branch._count.cashAdvances), 300, rowY).text(String(branch._count.expenses), 375, rowY).text(Number(branch.ledgerEntries[0]?.runningBalance ?? 0).toLocaleString(), 455, rowY); doc.moveTo(45, rowY + 18).lineTo(550, rowY + 18).strokeColor("#dddddd").stroke(); doc.y = rowY + 24; }
    doc.end();
  } catch (error) { next(error); }
});

const fundReportSchema = z.object({ fundId: z.string().min(1) });
async function fundReport(fundId) {
  const fund = await prisma.fund.findUnique({ where: { id: fundId }, include: { expenses: { where: { status: "APPROVED" }, include: { category: true } } } });
  if (!fund) return null;
  const totals = await fundTotals(prisma, fund.id);
  const categories = new Map();
  for (const expense of fund.expenses) categories.set(expense.category.name, (categories.get(expense.category.name) ?? 0) + Number(expense.amount));
  return { fund, totals, categories: [...categories.entries()].map(([category, amount]) => ({ category, amount })) };
}
router.get("/fund-utilization.csv", requirePermission("VIEW_LEDGER"), async (req, res, next) => { try {
  const { fundId } = fundReportSchema.parse(req.query); const report = await fundReport(fundId); if (!report) return res.status(404).json({ error: "Fund not found" });
  const { fund, totals, categories } = report; sendCsv(res, `fund-utilization-${fund.id}.csv`, ["Donor", "Grant", "Currency", "Grant Amount", "Spent", "Remaining", "Category", "Category Spend"], (categories.length ? categories : [{ category: "No approved expenses", amount: 0 }]).map((item) => [fund.donorName, fund.grantName, fund.currency, fund.totalAmount, totals.spent, totals.remaining, item.category, item.amount]));
} catch (error) { next(error); } });
router.get("/fund-utilization.pdf", requirePermission("VIEW_LEDGER"), async (req, res, next) => { try {
  const { fundId } = fundReportSchema.parse(req.query); const report = await fundReport(fundId); if (!report) return res.status(404).json({ error: "Fund not found" }); const { fund, totals, categories } = report;
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="fund-utilization-${fund.id}.pdf"` }); const doc = new PDFDocument({ margin: 48, size: "A4" }); doc.pipe(res); doc.fontSize(21).fillColor("#332070").text("Fund Utilization Report"); doc.moveDown(.4).fontSize(11).fillColor("#333").text(`${fund.donorName} · ${fund.grantName}`).fontSize(9).fillColor("#666").text(`Period: ${fund.startDate.toISOString().slice(0, 10)} to ${fund.endDate.toISOString().slice(0, 10)} · Generated ${new Date().toISOString().slice(0, 10)}`).moveDown(1.5); const money = (v) => `${fund.currency} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`; doc.fontSize(12).fillColor("#222").text(`Grant amount: ${money(fund.totalAmount)}`).text(`Spent: ${money(totals.spent)}`).text(`Remaining: ${money(totals.remaining)}`).moveDown(1.4).fontSize(14).fillColor("#332070").text("Approved expense categories").moveDown(.6); if (!categories.length) doc.fontSize(10).fillColor("#555").text("No approved expenses recorded."); for (const item of categories) doc.fontSize(10).fillColor("#222").text(item.category, { continued: true }).text(money(item.amount), { align: "right" }); doc.end();
} catch (error) { next(error); } });

export default router;
