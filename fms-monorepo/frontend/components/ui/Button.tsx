"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function Button({ className = "", children, ...props }, ref) {
  return <button ref={ref} className={`fms-button ${className}`.trim()} {...props}>{children}</button>;
});

export default Button;
