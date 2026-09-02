"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="auth-page"><section className="login-card error-card"><span className="error-icon">!</span><h1>Something went wrong</h1><p>We couldn&apos;t load this screen. Your data is safe—please try again.</p><Button className="submit" onClick={reset}>Try again <span>→</span></Button></section></main>;
}
