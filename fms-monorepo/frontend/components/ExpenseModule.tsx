"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, type Role, type SessionUser } from "@/lib/api";

type Category = { id: string; name: string; budgetCap: string };
type Advance = { id: string; purpose: string; amount: string; status: string };
type Expense = {
  id: string; amount: string; description: string; status: "PENDING" | "APPROVED" | "REJECTED"; receiptUrl: string;
  branch: { name: string; code: string }; creator: { name: string }; category: Category; cashAdvance: Advance | null;
  approvalSteps: { level: number; status: string; approver: { name: string; role: Role } | null }[];
};

const visibleRoles: Role[] = ["DATA_ENTRY_OPERATOR", "BRANCH_MANAGER", "ACCOUNTS_HEAD", "FINANCE_HEAD", "AUDITOR"];

export default function ExpenseModule({ role, user }: { role: Role; user: SessionUser | null }) {
  const [expenses, setExpenses] = useState<Expense[]>([]); const [categories, setCategories] = useState<Category[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]); const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const canCreate = role === "DATA_ENTRY_OPERATOR";
  const load = useCallback(async () => {
    try {
      const [expenseData, categoryData, advanceData] = await Promise.all([apiFetch<Expense[]>("/api/expenses"), apiFetch<Category[]>("/api/categories"), apiFetch<Advance[]>("/api/cash-advance")]);
      setExpenses(expenseData); setCategories(categoryData); setAdvances(advanceData.filter((item) => item.status === "DISBURSED"));
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not load expenses" }); }
  }, []);
  useEffect(() => { if (user && visibleRoles.includes(role)) load(); }, [user, role, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null); const form = event.currentTarget; const data = new FormData(form);
    try { await apiFetch("/api/expenses", { method: "POST", body: data }); form.reset(); setMessage({ type: "success", text: "Expense and receipt submitted for approval." }); await load(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Expense submission failed" }); }
  }
  async function decide(id: string, action: "approve" | "reject") {
    setWorkingId(id); setMessage(null);
    try { const result = await apiFetch<{ warning: string | null; nextRequiredRole: Role | null }>(`/api/expenses/${id}/${action}`, { method: "PATCH", body: JSON.stringify({}) }); setMessage({ type: "success", text: result.warning ?? `Expense ${action}d.${result.nextRequiredRole ? ` Next: ${result.nextRequiredRole.replaceAll("_", " ")}.` : ""}` }); await load(); }
    catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Review failed" }); }
    finally { setWorkingId(""); }
  }
  if (!visibleRoles.includes(role)) return null;
  return <section className="phase-module expense-module">
    <div className="module-heading"><div><span>PHASE 2 WORKFLOW</span><h2>Expense management</h2><p>{canCreate ? "Record an expense with its receipt." : "Track and review branch expenses."}</p></div><strong>{expenses.filter((item) => item.status === "PENDING").length} pending</strong></div>
    {message && <div className={`inline-message ${message.type}`}>{message.text}</div>}
    {canCreate && <form className="expense-form" onSubmit={submit}><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Category<select name="categoryId" required defaultValue=""><option value="" disabled>Select category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name} · cap ${Number(item.budgetCap).toLocaleString()}</option>)}</select></label><label>Linked advance (optional)<select name="cashAdvanceId" defaultValue=""><option value="">No linked advance</option>{advances.map((item) => <option key={item.id} value={item.id}>{item.purpose} · ${Number(item.amount).toLocaleString()}</option>)}</select></label><label className="wide-field">Description<input name="description" minLength={3} maxLength={500} required /></label><label className="receipt-field">Receipt (JPG, PNG, WebP or PDF; max 5 MB)<input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label><button type="submit">Submit expense →</button></form>}
    <div className="advance-table-wrap"><table className="advance-table"><thead><tr><th>Branch</th><th>Creator</th><th>Category / description</th><th>Amount</th><th>Status</th><th>Receipt</th><th>Action</th></tr></thead><tbody>{expenses.length === 0 ? <tr><td colSpan={7} className="empty-row">No expenses yet.</td></tr> : expenses.map((item) => { const nextRole: Role | null = item.status === "PENDING" ? (item.approvalSteps.length === 0 ? "BRANCH_MANAGER" : "ACCOUNTS_HEAD") : null; const canAct = nextRole === role; return <tr key={item.id}><td><b>{item.branch.name}</b><small>{item.branch.code}</small></td><td>{item.creator.name}</td><td><b>{item.category.name}</b><small>{item.description}</small></td><td className="amount-cell">${Number(item.amount).toLocaleString()}</td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span>{nextRole && <small>Next: {nextRole.replaceAll("_", " ")}</small>}</td><td><a className="receipt-link" href={`http://localhost:4000${item.receiptUrl}`} target="_blank">View</a></td><td><div className="row-actions">{canAct ? <><button disabled={workingId === item.id} onClick={() => decide(item.id, "approve")}>Approve L{item.approvalSteps.length + 1}</button><button className="reject" disabled={workingId === item.id} onClick={() => decide(item.id, "reject")}>Reject</button></> : nextRole ? <small>Waiting for role</small> : <small>Complete</small>}</div></td></tr>; })}</tbody></table></div>
  </section>;
}
