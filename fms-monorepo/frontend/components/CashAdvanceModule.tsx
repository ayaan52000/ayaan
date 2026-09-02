"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, type Role, type SessionUser } from "@/lib/api";

type CashAdvance = {
  id: string; amount: string; purpose: string; status: "REQUESTED" | "APPROVED" | "REJECTED" | "DISBURSED";
  createdAt: string; branch: { name: string; code: string }; requester: { name: string; email: string };
  approvalSteps: { level: number; status: "APPROVED" | "REJECTED"; approver: { name: string; role: Role } | null }[];
};

const requesterRoles: Role[] = ["BRANCH_MANAGER", "PROGRAM_OFFICER"];
const reviewerRoles: Role[] = ["FINANCE_HEAD", "ACCOUNTS_HEAD"];

export default function CashAdvanceModule({ role, user }: { role: Role; user: SessionUser | null }) {
  const [items, setItems] = useState<CashAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [workingId, setWorkingId] = useState("");
  const canRequest = requesterRoles.includes(role);
  const canReview = reviewerRoles.includes(role);

  const load = useCallback(async () => {
    try { setItems(await apiFetch<CashAdvance[]>("/api/cash-advance")); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not load requests" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user && (canRequest || canReview || role === "AUDITOR" || role === "DATA_ENTRY_OPERATOR")) load(); }, [user, canRequest, canReview, role, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null);
    if (!user?.branchId) return setMessage({ type: "error", text: "Your user is not assigned to a branch." });
    const form = event.currentTarget; const data = new FormData(form);
    try {
      await apiFetch("/api/cash-advance", { method: "POST", body: JSON.stringify({ branchId: user.branchId, amount: Number(data.get("amount")), purpose: data.get("purpose") }) });
      form.reset(); setMessage({ type: "success", text: "Cash advance request submitted successfully." }); await load();
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Submission failed" }); }
  }

  async function action(id: string, name: "approve" | "reject" | "disburse") {
    setWorkingId(id); setMessage(null);
    try { const result = await apiFetch<{ nextRequiredRole?: Role | null }>(`/api/cash-advance/${id}/${name}`, { method: "PATCH", body: JSON.stringify({}) }); const next = result.nextRequiredRole ? ` Next approval: ${result.nextRequiredRole.replaceAll("_", " ")}.` : ""; setMessage({ type: "success", text: `Request ${name === "disburse" ? "disbursed" : `${name}d`} successfully.${next}` }); await load(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Action failed" }); }
    finally { setWorkingId(""); }
  }

  if (!canRequest && !canReview && role !== "AUDITOR" && role !== "DATA_ENTRY_OPERATOR") return null;
  return <section className="phase-module">
    <div className="module-heading"><div><span>PHASE 1 WORKFLOW</span><h2>Cash advances</h2><p>{canRequest ? "Submit a request and track its progress." : "Review, approve and disburse branch requests."}</p></div>{canReview && <strong>{items.filter((item) => item.status === "REQUESTED").length} pending</strong>}</div>
    {message && <div className={`inline-message ${message.type}`}>{message.text}</div>}
    {canRequest && <form className="advance-form" onSubmit={submit}><label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" placeholder="2,500" required /></label><label>Purpose<input name="purpose" minLength={3} maxLength={500} placeholder="e.g. Field visit expenses" required /></label><button type="submit">Submit request <span>→</span></button></form>}
    <div className="advance-table-wrap"><table className="advance-table"><thead><tr><th>Branch</th><th>Requested by</th><th>Purpose</th><th>Amount</th><th>Status</th>{canReview && <th>Actions</th>}</tr></thead><tbody>
      {loading ? <tr><td colSpan={6}>Loading requests…</td></tr> : items.length === 0 ? <tr><td className="empty-row" colSpan={6}>No cash advance requests yet.</td></tr> : items.map((item) => { const nextRole: Role | null = item.status === "REQUESTED" ? (item.approvalSteps.length === 0 ? "ACCOUNTS_HEAD" : "FINANCE_HEAD") : null; const canAct = nextRole === role; return <tr key={item.id}><td><b>{item.branch.name}</b><small>{item.branch.code}</small></td><td><b>{item.requester.name}</b><small>{item.requester.email}</small></td><td className="purpose-cell">{item.purpose}</td><td className="amount-cell">${Number(item.amount).toLocaleString()}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span>{nextRole && <small>Next: {nextRole.replaceAll("_", " ")}</small>}</td>{canReview && <td><div className="row-actions">{item.status === "REQUESTED" && canAct && <><button disabled={workingId === item.id} onClick={() => action(item.id, "approve")}>Approve L{item.approvalSteps.length + 1}</button><button className="reject" disabled={workingId === item.id} onClick={() => action(item.id, "reject")}>Reject</button></>}{item.status === "APPROVED" && <button className="disburse" disabled={workingId === item.id} onClick={() => action(item.id, "disburse")}>Disburse</button>}{item.status === "REQUESTED" && !canAct && <small>Waiting for {nextRole?.replaceAll("_", " ")}</small>}</div></td>}</tr>; })}</tbody></table></div>
  </section>;
}
