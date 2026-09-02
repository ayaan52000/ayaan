export type Role = "FINANCE_HEAD" | "ACCOUNTS_HEAD" | "BRANCH_MANAGER" | "DATA_ENTRY_OPERATOR" | "PROGRAM_OFFICER" | "AUDITOR";
export type SessionUser = { id: string; name: string; email: string; role: Role; branchId: string | null };

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(!isFormData ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const result = await apiFetch<{ token: string; user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  localStorage.setItem("token", result.token);
  localStorage.setItem("user", JSON.stringify(result.user));
  return result.user;
}
