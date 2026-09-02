import { Router } from "express";
import { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
const localRoles = new Set(["BRANCH_MANAGER", "PROGRAM_OFFICER", "DATA_ENTRY_OPERATOR"]);
router.get("/:id/receipt.pdf", authenticate, async (req, res, next) => {
  try {
    const advance = await prisma.cashAdvance.findFirst({ where: { id: req.params.id, ...(localRoles.has(req.user.role) ? { branchId: req.user.branchId ?? "__none__" } : {}) }, include: { branch: true, requester: true, approvalSteps: { include: { approver: true }, orderBy: { level: "asc" } }, expenses: true } });
    if (!advance) return res.status(404).json({ error: "Cash advance not found" });
    if (!['DISBURSED', 'SETTLED'].includes(advance.status)) return res.status(409).json({ error: "Voucher is available only after disbursement" });
    const approvedExpenses = advance.expenses.filter((item) => item.status === "APPROVED").reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
    const variance = new Prisma.Decimal(advance.amount).minus(approvedExpenses);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="cash-advance-${advance.id}.pdf"` });
    const doc = new PDFDocument({ margin: 55, size: "A4" }); doc.pipe(res);
    doc.fontSize(22).fillColor("#332070").text("FMS Cash Advance Voucher").moveDown();
    const line = (label, value) => { doc.fontSize(9).fillColor("#777777").text(label.toUpperCase()); doc.fontSize(12).fillColor("#111111").text(String(value)).moveDown(.65); };
    line("Voucher ID", advance.id); line("Branch", `${advance.branch.name} (${advance.branch.code})`); line("Requested by", `${advance.requester.name} — ${advance.requester.email}`); line("Purpose", advance.purpose); line("Amount disbursed", Number(advance.amount).toLocaleString()); line("Status", advance.status); line("Disbursed at", advance.disbursedAt?.toLocaleString() ?? "—");
    doc.moveDown().fontSize(14).fillColor("#332070").text("Approvals").moveDown(.5);
    for (const step of advance.approvalSteps) doc.fontSize(10).fillColor("#222222").text(`Level ${step.level}: ${step.status} — ${step.approver?.name ?? "Unknown"} (${step.approver?.role ?? "—"}) · ${step.actedAt?.toLocaleString() ?? "—"}`);
    doc.moveDown().fontSize(14).fillColor("#332070").text("Reconciliation").moveDown(.5); line("Approved expenses", Number(approvedExpenses).toLocaleString()); line("Settlement variance", Number(variance).toLocaleString());
    doc.moveDown(2).fontSize(8).fillColor("#777777").text("System-generated record. Verify against original receipts and approvals.", { align: "center" }); doc.end();
  } catch (error) { next(error); }
});
export default router;
