export type Role = "FINANCE_HEAD" | "ACCOUNTS_HEAD" | "BRANCH_MANAGER" | "DATA_ENTRY_OPERATOR" | "PROGRAM_OFFICER" | "AUDITOR";
export type SessionUser = { id: string; name: string; email: string; role: Role; branchId: string | null };

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path) || !API_URL) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: "include",
    headers: { ...(!isFormData ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const result = await apiFetch<{ user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  localStorage.removeItem("token");
  localStorage.setItem("user", JSON.stringify(result.user));
  return result.user;
}

export async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
