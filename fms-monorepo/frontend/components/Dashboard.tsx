"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Role, SessionUser } from "@/lib/api";
import CashAdvanceModule from "./CashAdvanceModule";
import ExpenseModule from "./ExpenseModule";
import LedgerDashboard from "./LedgerDashboard";
import ReportsModule from "./ReportsModule";
import AuditLogViewer from "./AuditLogViewer";

const roleNames: Record<Role, string> = {
  FINANCE_HEAD: "Finance Head", ACCOUNTS_HEAD: "Accounts Head", BRANCH_MANAGER: "Branch Manager",
  DATA_ENTRY_OPERATOR: "Data Entry", PROGRAM_OFFICER: "Program Officer", AUDITOR: "Auditor",
};
const icons = { dashboard: "⌂", advances: "↗", expenses: "▤", approvals: "✓", ledger: "◇", branches: "⌘", reports: "▥" };
const chartData = [
  { month: "Jan", income: 74, expense: 42 }, { month: "Feb", income: 48, expense: 38 },
  { month: "Mar", income: 52, expense: 47 }, { month: "Apr", income: 70, expense: 51 },
  { month: "May", income: 58, expense: 49 }, { month: "Jun", income: 66, expense: 45 },
  { month: "Jul", income: 53, expense: 44 }, { month: "Aug", income: 82, expense: 57 },
  { month: "Sep", income: 68, expense: 52 }, { month: "Oct", income: 88, expense: 60 },
];

export default function Dashboard({ role }: { role: Role }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => { const value = localStorage.getItem("user"); if (value) setUser(JSON.parse(value)); }, []);

  function logout() { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "/login"; }

  return <main className="dashboard-page">
    <div className="aurora aurora-one" /><div className="aurora aurora-two" />
    <section className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span><span><b>FMS</b><small>Finance management</small></span></div>
        <nav>
          <a className="active"><span>{icons.dashboard}</span>Overview</a>
          <a href="#cash-advances"><span>{icons.advances}</span>Cash advances</a><a href="#expenses"><span>{icons.expenses}</span>Expenses</a>
          <a href="#expenses"><span>{icons.approvals}</span>Approvals</a><a href="#ledger"><span>{icons.ledger}</span>Ledger</a>
          <p>MANAGEMENT</p><a><span>{icons.branches}</span>Branches</a><a href="#reports"><span>{icons.reports}</span>Reports</a>
          {(role === "AUDITOR" || role === "FINANCE_HEAD") && <a href="#audit"><span>◎</span>Audit log</a>}
          {role === "FINANCE_HEAD" && <a href="/register"><span>＋</span>Register user</a>}
        </nav>
        <div className="side-profile"><div className="avatar">{user?.name?.[0] ?? "U"}</div><div><b>{user?.name ?? roleNames[role]}</b><small>{roleNames[role]}</small></div><button onClick={logout} title="Sign out">↪</button></div>
      </aside>

      <div className="content">
        <header><div><small>FINANCE MANAGEMENT SYSTEM</small><h1>Good morning, {user?.name?.split(" ")[0] ?? roleNames[role]}</h1><p>Here&apos;s what&apos;s happening with your finances today.</p></div><div className="header-tools"><button className="search">⌕ <span>Search anything…</span></button><button className="round">●</button><div className="mini-avatar">{user?.name?.[0] ?? "U"}</div></div></header>

        <div className="metrics">
          <Metric title="Available balance" value="$ 124,580" trend="+8.2%" icon="$" />
          <Metric title="Pending approvals" value="18" trend="5 urgent" icon="✓" warning />
          <Metric title="Monthly expenses" value="$ 42,890" trend="−3.4%" icon="▤" />
          <Metric title="Active branches" value="24" trend="All active" icon="⌘" />
        </div>

        <div className="grid-main">
          <section className="card chart-card"><CardTitle title="Cash flow overview" subtitle="Income and expenses across all branches" />
            <div className="legend"><span><i className="dot purple" />Income</span><span><i className="dot blue" />Expenses</span><select aria-label="Chart range"><option>Last 10 months</option></select></div>
            <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}><defs><linearGradient id="income" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8758ff" stopOpacity=".55"/><stop offset="1" stopColor="#8758ff" stopOpacity="0"/></linearGradient><linearGradient id="expense" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#17d8ff" stopOpacity=".25"/><stop offset="1" stopColor="#17d8ff" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="#17264b" vertical={false}/><XAxis dataKey="month" stroke="#64739a" tickLine={false} axisLine={false}/><YAxis stroke="#64739a" tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: "#0b1530", border: "1px solid #283767", borderRadius: 12 }}/><Area type="monotone" dataKey="income" stroke="#8758ff" strokeWidth={3} fill="url(#income)"/><Area type="monotone" dataKey="expense" stroke="#17d8ff" strokeWidth={2} fill="url(#expense)"/></AreaChart></ResponsiveContainer></div>
          </section>

          <section className="card budget-card"><CardTitle title="Budget utilization" subtitle="Monthly spending limit" /><div className="ring"><div><strong>68%</strong><span>utilized</span></div></div><div className="budget-values"><span><small>Spent</small><b>$68,240</b></span><span><small>Remaining</small><b>$31,760</b></span></div><div className="progress"><i /></div><p>12 days remaining in this cycle</p></section>

          <section className="card approvals-card"><CardTitle title="Recent approvals" subtitle="Items waiting for your review" action="View all" /><div className="approval-list"><Approval initials="AK" name="Ahmed Khan" detail="Travel advance · Lahore" amount="$2,450" color="violet"/><Approval initials="SM" name="Sara Malik" detail="Office supplies · Karachi" amount="$1,280" color="cyan"/><Approval initials="UR" name="Usman Raza" detail="Field visit · Islamabad" amount="$3,120" color="orange"/></div></section>
          <section className="card activity-card"><CardTitle title="Branch activity" subtitle="Expenses by location" action="View report"/><Branch name="Karachi Central" value="$14,280" width="82%"/><Branch name="Lahore East" value="$11,940" width="67%"/><Branch name="Islamabad" value="$9,860" width="55%"/><Branch name="Peshawar" value="$6,810" width="38%"/></section>
        </div>
        <div id="cash-advances"><CashAdvanceModule role={role} user={user} /></div>
        <div id="expenses"><ExpenseModule role={role} user={user} /></div>
        <div id="ledger"><LedgerDashboard role={role} user={user} /></div>
        <div id="reports"><ReportsModule role={role} /></div>
        <div id="audit"><AuditLogViewer role={role} user={user} /></div>
      </div>
    </section>
  </main>;
}

function Metric({ title, value, trend, icon, warning = false }: { title: string; value: string; trend: string; icon: string; warning?: boolean }) { return <section className="card metric"><div><small>{title}</small><strong>{value}</strong><span className={warning ? "warn" : ""}>{trend}</span></div><i>{icon}</i></section>; }
function CardTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) { return <div className="card-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button>{action} →</button>}</div>; }
function Approval({ initials, name, detail, amount, color }: { initials: string; name: string; detail: string; amount: string; color: string }) { return <div className="approval"><span className={`person ${color}`}>{initials}</span><div><b>{name}</b><small>{detail}</small></div><strong>{amount}</strong><button>Review</button></div>; }
function Branch({ name, value, width }: { name: string; value: string; width: string }) { return <div className="branch"><div><span>{name}</span><b>{value}</b></div><div className="bar"><i style={{ width }} /></div></div>; }
