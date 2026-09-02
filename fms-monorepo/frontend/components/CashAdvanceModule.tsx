"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, type Role, type SessionUser } from "@/lib/api";
import Button from "./ui/Button";

type CashAdvance = {
  id: string; amount: string; purpose: string; status: "REQUESTED" | "APPROVED" | "REJECTED" | "DISBURSED" | "SETTLED";
  createdAt: string; branch: { name: string; code: string }; requester: { name: string; email: string };
  approvalSteps: { level: number; status: "APPROVED" | "REJECTED"; approver: { name: string; role: Role } | null }[];
};
type Reconciliation = { id: string; status: string; disbursedAmount: string; totalApprovedExpenses: string; variance: string; hasPendingExpenses: boolean; branch: { name: string }; expenses: { id: string; amount: string; status: string; description: string }[] };

const requesterRoles: Role[] = ["BRANCH_MANAGER", "PROGRAM_OFFICER"];
const reviewerRoles: Role[] = ["FINANCE_HEAD", "ACCOUNTS_HEAD"];

export default function CashAdvanceModule({ role, user }: { role: Role; user: SessionUser | null }) {
  const [items, setItems] = useState<CashAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [workingId, setWorkingId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const canRequest = requesterRoles.includes(role);
  const canReview = reviewerRoles.includes(role);

  const load = useCallback(async () => {
    try { setItems(await apiFetch<CashAdvance[]>("/api/cash-advance")); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not load requests" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user && (canRequest || canReview || role === "AUDITOR" || role === "DATA_ENTRY_OPERATOR")) load(); }, [user, canRequest, canReview, role, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null); setSubmitting(true);
    if (!user?.branchId) { setSubmitting(false); return setMessage({ type: "error", text: "Your user is not assigned to a branch." }); }
    const form = event.currentTarget; const data = new FormData(form);
    try {
      await apiFetch("/api/cash-advance", { method: "POST", body: JSON.stringify({ branchId: user.branchId, amount: Number(data.get("amount")), purpose: data.get("purpose") }) });
      form.reset(); setMessage({ type: "success", text: "Cash advance request submitted successfully." }); await load();
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Submission failed" }); }
    finally { setSubmitting(false); }
  }

  async function action(id: string, name: "approve" | "reject" | "disburse") {
    setWorkingId(id); setMessage(null);
    try { const result = await apiFetch<{ nextRequiredRole?: Role | null }>(`/api/cash-advance/${id}/${name}`, { method: "PATCH", body: JSON.stringify({}) }); const next = result.nextRequiredRole ? ` Next approval: ${result.nextRequiredRole.replaceAll("_", " ")}.` : ""; setMessage({ type: "success", text: `Request ${name === "disburse" ? "disbursed" : `${name}d`} successfully.${next}` }); await load(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Action failed" }); }
    finally { setWorkingId(""); }
  }

  async function previewSettlement(id: string) {
    setWorkingId(id); setMessage(null);
    try { setReconciliation(await apiFetch<Reconciliation>(`/api/cash-advance/${id}/reconciliation-summary`)); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not load settlement summary" }); }
    finally { setWorkingId(""); }
  }

  async function settle() {
    if (!reconciliation) return; setWorkingId(reconciliation.id);
    try { await apiFetch(`/api/cash-advance/${reconciliation.id}/settle`, { method: "PATCH", body: JSON.stringify({}) }); setMessage({ type: "success", text: "Cash advance reconciled and settled." }); setReconciliation(null); await load(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Settlement failed" }); }
    finally { setWorkingId(""); }
  }

  async function downloadVoucher(id: string) {
    setWorkingId(id);
    try { const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"}/api/cash-advance/${id}/receipt.pdf`, { credentials: "include" }); if (!response.ok) throw new Error("Voucher download failed"); const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `cash-advance-${id}.pdf`; anchor.click(); URL.revokeObjectURL(url); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Voucher download failed" }); }
    finally { setWorkingId(""); }
  }

  if (!canRequest && !canReview && role !== "AUDITOR" && role !== "DATA_ENTRY_OPERATOR") return null;
  return <section className="phase-module">
    <div className="module-heading"><div><span>PHASE 1 WORKFLOW</span><h2>Cash advances</h2><p>{canRequest ? "Submit a request and track its progress." : "Review, approve and disburse branch requests."}</p></div>{canReview && <strong>{items.filter((item) => item.status === "REQUESTED").length} pending</strong>}</div>
    {message && <div className={`inline-message ${message.type}`}>{message.text}</div>}
    {reconciliation && <div className="settlement-panel"><div><span>Settlement preview · {reconciliation.branch.name}</span><strong>${Number(reconciliation.disbursedAmount).toLocaleString()} disbursed</strong></div><div><span>Approved expenses</span><strong>${Number(reconciliation.totalApprovedExpenses).toLocaleString()}</strong></div><div><span>Variance</span><strong className={Number(reconciliation.variance) < 0 ? "negative" : ""}>${Number(reconciliation.variance).toLocaleString()}</strong></div><div className="settlement-actions"><Button onClick={() => setReconciliation(null)}>Cancel</Button><Button disabled={reconciliation.hasPendingExpenses || workingId === reconciliation.id} onClick={settle}>{reconciliation.hasPendingExpenses ? "Pending expenses remain" : "Confirm settlement"}</Button></div></div>}
    {canRequest && <form className="advance-form" onSubmit={submit}><label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" placeholder="2,500" required /></label><label>Purpose<input name="purpose" minLength={3} maxLength={500} placeholder="e.g. Field visit expenses" required /></label><Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit request"} <span>→</span></Button></form>}
    <div className="advance-table-wrap"><table className="advance-table"><thead><tr><th>Branch</th><th>Requested by</th><th>Purpose</th><th>Amount</th><th>Status</th>{canReview && <th>Actions</th>}</tr></thead><tbody>
      {loading ? <tr><td colSpan={6}>Loading requests…</td></tr> : items.length === 0 ? <tr><td className="empty-row" colSpan={6}>No cash advance requests yet.</td></tr> : items.map((item) => { const nextRole: Role | null = item.status === "REQUESTED" ? (item.approvalSteps.length === 0 ? "ACCOUNTS_HEAD" : "FINANCE_HEAD") : null; const canAct = nextRole === role; return <tr key={item.id}><td><b>{item.branch.name}</b><small>{item.branch.code}</small></td><td><b>{item.requester.name}</b><small>{item.requester.email}</small></td><td className="purpose-cell">{item.purpose}</td><td className="amount-cell">${Number(item.amount).toLocaleString()}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span>{nextRole && <small>Next: {nextRole.replaceAll("_", " ")}</small>}{(item.status === "DISBURSED" || item.status === "SETTLED") && <Button className="voucher-link" onClick={() => downloadVoucher(item.id)}>PDF voucher</Button>}</td>{canReview && <td><div className="row-actions">{item.status === "REQUESTED" && canAct && <><Button disabled={workingId === item.id} onClick={() => action(item.id, "approve")}>Approve L{item.approvalSteps.length + 1}</Button><Button className="reject" disabled={workingId === item.id} onClick={() => action(item.id, "reject")}>Reject</Button></>}{item.status === "APPROVED" && <Button className="disburse" disabled={workingId === item.id} onClick={() => action(item.id, "disburse")}>Disburse</Button>}{item.status === "DISBURSED" && role === "ACCOUNTS_HEAD" && <Button className="settle" disabled={workingId === item.id} onClick={() => previewSettlement(item.id)}>Reconcile</Button>}{item.status === "REQUESTED" && !canAct && <small>Waiting for {nextRole?.replaceAll("_", " ")}</small>}</div></td>}</tr>; })}</tbody></table></div>
  </section>;
}
