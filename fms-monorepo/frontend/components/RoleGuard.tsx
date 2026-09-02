"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role, SessionUser } from "@/lib/api";

export default function RoleGuard({ allowedRole, children }: { allowedRole: Role; children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return router.replace("/login");
    try {
      const user = JSON.parse(stored) as SessionUser;
      if (user.role !== allowedRole) return router.replace("/unauthorized");
      setReady(true);
    } catch {
      localStorage.removeItem("user");
      router.replace("/login");
    }
  }, [allowedRole, router]);

  return ready ? children : <div className="loading-screen"><div className="spinner" />Checking access…</div>;
}
