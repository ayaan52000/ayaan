import { emailLayout } from "./base.js";
export default (data) => ({ subject: "Expense awaiting approval", html: emailLayout({ title: "Expense submitted", ...data, actionLabel: "Review expense" }) });
