import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FMS · Finance Management", description: "Finance and petty cash management" };
const themeScript = `(function(){try{var t=localStorage.getItem('fms_theme');if(t==='ocean'||t==='sunset'||t==='slate')document.documentElement.dataset.theme=t;else document.documentElement.dataset.theme='ocean'}catch(e){document.documentElement.dataset.theme='ocean'}})()`;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" data-theme="ocean" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}</body></html>; }
