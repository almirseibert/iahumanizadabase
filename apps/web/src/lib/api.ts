"use client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("iah_token");

export const setToken = (token: string | null) => {
  if (token) localStorage.setItem("iah_token", token);
  else localStorage.removeItem("iah_token");
};

export const getStoredUser = (): { role: string; tenantId: string | null; name: string } | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("iah_user");
  return raw ? JSON.parse(raw) : null;
};

export const setStoredUser = (user: unknown | null) => {
  if (user) localStorage.setItem("iah_user", JSON.stringify(user));
  else localStorage.removeItem("iah_user");
};

/** Tenant ativo (SUPERADMIN escolhe no seletor; demais usam o do próprio usuário) */
export const getActiveTenantId = (): string | null => {
  const user = getStoredUser();
  if (user?.tenantId) return user.tenantId;
  return typeof window === "undefined" ? null : localStorage.getItem("iah_tenant");
};

export const setActiveTenantId = (tenantId: string | null) => {
  if (tenantId) localStorage.setItem("iah_tenant", tenantId);
  else localStorage.removeItem("iah_tenant");
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; tenantHeader?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const tenantId = getActiveTenantId();
  if (tenantId && options.tenantHeader !== false) headers["x-tenant-id"] = tenantId;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
    setToken(null);
    window.location.href = "/login";
    throw new ApiError("Sessão expirada", 401);
  }
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
