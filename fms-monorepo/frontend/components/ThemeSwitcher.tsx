"use client";

import { useEffect, useState } from "react";
import Button from "./ui/Button";

const themes = [
  { id: "ocean", label: "Ocean" },
  { id: "sunset", label: "Sunset" },
  { id: "slate", label: "Slate" },
] as const;
type Theme = typeof themes[number]["id"];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("ocean"); const [open, setOpen] = useState(false);
  useEffect(() => { setTheme((document.documentElement.dataset.theme as Theme) || "ocean"); }, []);
  function choose(value: Theme) { document.documentElement.dataset.theme = value; localStorage.setItem("fms_theme", value); setTheme(value); setOpen(false); }
  return <div className="theme-switcher"><Button className="round theme-trigger" aria-label="Choose color theme" onClick={() => setOpen(!open)}><i className={`theme-swatch ${theme}`} /></Button>{open && <div className="theme-menu">{themes.map((item) => <Button key={item.id} className={theme === item.id ? "selected" : ""} onClick={() => choose(item.id)}><i className={`theme-swatch ${item.id}`} />{item.label}{theme === item.id && <span>✓</span>}</Button>)}</div>}</div>;
}
