"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type SessionUser } from "@/lib/api";
import Button from "./ui/Button";

type Notification = { id: string; message: string; type: string; entityType: string; entityId: string; isRead: boolean; createdAt: string };
type Response = { items: Notification[]; unreadCount: number };

export default function NotificationBell({ user }: { user: SessionUser | null }) {
  const [data, setData] = useState<Response>({ items: [], unreadCount: 0 }); const [open, setOpen] = useState(false);
  const load = useCallback(() => apiFetch<Response>("/api/notifications").then(setData).catch(() => undefined), []);
  useEffect(() => { if (!user) return; load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, [user, load]);
  async function select(item: Notification) {
    if (!item.isRead) { await apiFetch(`/api/notifications/${item.id}/read`, { method: "PATCH", body: JSON.stringify({}) }); setData((current) => ({ unreadCount: Math.max(0, current.unreadCount - 1), items: current.items.map((row) => row.id === item.id ? { ...row, isRead: true } : row) })); }
    setOpen(false);
    const stored = JSON.parse(localStorage.getItem("user") ?? "null") as { role?: string } | null;
    const paths: Record<string, string> = { FINANCE_HEAD: "finance-head", ACCOUNTS_HEAD: "accounts-head", BRANCH_MANAGER: "branch-manager", DATA_ENTRY_OPERATOR: "data-entry", PROGRAM_OFFICER: "program-officer", AUDITOR: "auditor" };
    if (stored?.role && paths[stored.role]) window.location.href = `/${paths[stored.role]}/${item.entityType === "Expense" ? "expenses" : "cash-advances"}`;
  }
  return <div className="notification-wrap"><Button className="round notification-button" aria-label="Notifications" onClick={() => setOpen(!open)}>♢{data.unreadCount > 0 && <i>{data.unreadCount > 9 ? "9+" : data.unreadCount}</i>}</Button>{open && <div className="notification-menu"><header><b>Notifications</b><span>{data.unreadCount} unread</span></header><div>{data.items.length === 0 ? <p>No notifications yet.</p> : data.items.slice(0, 10).map((item) => <Button key={item.id} className={item.isRead ? "read" : ""} onClick={() => select(item)}><i className={`notification-type ${item.type.toLowerCase()}`}/><span><b>{item.message}</b><small>{new Date(item.createdAt).toLocaleString()}</small></span></Button>)}</div></div>}</div>;
}
