"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  api,
  getActiveTenantId,
  getStoredUser,
  getToken,
  setActiveTenantId,
  setStoredUser,
  setToken,
} from "@/lib/api";

const NAV = [
  { href: "/conversas", label: "💬 Conversas" },
  { href: "/tenants", label: "🏪 Negócios" },
  { href: "/persona", label: "🤖 Persona IA" },
  { href: "/catalogo", label: "📋 Catálogo" },
  { href: "/conhecimento", label: "📚 Conhecimento" },
  { href: "/campanhas", label: "📣 Campanhas" },
  { href: "/metricas", label: "📊 Métricas" },
  { href: "/configuracoes", label: "⚙️ Configurações" },
];

interface TenantOption {
  id: string;
  name: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string; tenantId: string | null } | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [activeTenant, setActiveTenant] = useState<string>("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const stored = getStoredUser();
    setUser(stored);
    setActiveTenant(getActiveTenantId() ?? "");
    setReady(true);

    if (stored?.role === "SUPERADMIN") {
      api<{ tenants: TenantOption[] }>("/tenants", { tenantHeader: false })
        .then((data) => {
          setTenants(data.tenants);
          if (!getActiveTenantId() && data.tenants[0]) {
            setActiveTenantId(data.tenants[0].id);
            setActiveTenant(data.tenants[0].id);
          }
        })
        .catch(() => {});
    }
  }, [router]);

  const changeTenant = useCallback((id: string) => {
    setActiveTenantId(id);
    setActiveTenant(id);
    window.location.reload();
  }, []);

  function logout() {
    setToken(null);
    setStoredUser(null);
    setActiveTenantId(null);
    router.replace("/login");
  }

  if (!ready) return null;

  const isInbox = pathname === "/conversas";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">IA Humanizada</div>
        {user?.role === "SUPERADMIN" && tenants.length > 0 && (
          <select
            className="tenant-select"
            value={activeTenant}
            onChange={(e) => changeTenant(e.target.value)}
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <nav>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname.startsWith(item.href) ? "active" : ""}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="foot">
          <div style={{ marginBottom: 4 }}>{user?.name}</div>
          <button onClick={logout}>Sair →</button>
        </div>
      </aside>
      <main className={`main${isInbox ? " no-pad" : ""}`}>{children}</main>
    </div>
  );
}
