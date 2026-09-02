import Link from "next/link";
export default function Unauthorized() { return <main className="auth-page"><section className="login-card error-card"><span className="error-icon">!</span><h1>Access restricted</h1><p>You don&apos;t have permission to view this dashboard.</p><Link className="submit" href="/login">Return to sign in <span>→</span></Link></section></main>; }
