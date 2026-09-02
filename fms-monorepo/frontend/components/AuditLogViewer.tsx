"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type Role, type SessionUser } from "@/lib/api";

type AuditItem = { id: string; action: string; entity: string; entityId: string | null; metadata: unknown; createdAt: string; actor: { name: string; email: string; role: Role } | null };
type AuditResponse = { items: AuditItem[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } };

export default function AuditLogViewer({ role, user }: { role: Role; user: SessionUser | null }) {
  const [data, setData] = useState<AuditResponse | null>(null); const [entity, setEntity] = useState(""); const [offset, setOffset] = useState(0); const [error, setError] = useState("");
  const allowed = role === "AUDITOR" || role === "FINANCE_HEAD";
  const load = useCallback(async () => { if (!allowed) return; try { const params = new URLSearchParams({ limit: "15", offset: String(offset) }); if (entity) params.set("entityType", entity); setData(await apiFetch<AuditResponse>(`/api/audit?${params}`)); } catch (e) { setError(e instanceof Error ? e.message : "Could not load audit log"); } }, [allowed, entity, offset]);
  useEffect(() => { if (user) load(); }, [user, load]);
  if (!allowed) return null;
  return <section className="phase-module audit-module"><div className="module-heading"><div><span>IMMUTABLE ACTIVITY TRAIL</span><h2>Audit log</h2><p>Who changed what, and when.</p></div><select aria-label="Entity filter" value={entity} onChange={(e) => { setEntity(e.target.value); setOffset(0); }}><option value="">All entities</option><option>CashAdvance</option><option>Expense</option><option>User</option><option>Branch</option></select></div>{error && <div className="inline-message error">{error}</div>}<div className="audit-list">{data?.items.map((item) => <article key={item.id}><span className="audit-dot"/><div><b>{item.action.replaceAll("_", " ")}</b><small>{item.entity} · {item.entityId?.slice(-8) ?? "—"}</small></div><div><b>{item.actor?.name ?? "System"}</b><small>{item.actor?.role.replaceAll("_", " ") ?? "SYSTEM"}</small></div><time>{new Date(item.createdAt).toLocaleString()}</time></article>)}{data?.items.length === 0 && <p className="empty-row">No matching audit activity.</p>}</div>{data && <div className="pagination"><span>{data.pagination.total} total records</span><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 15))}>← Previous</button><button disabled={!data.pagination.hasMore} onClick={() => setOffset(offset + 15)}>Next →</button></div>}</section>;
}
