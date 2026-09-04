import { emailLayout } from "./base.js";
export default (data) => ({ subject: `Expense ${data.decision.toLowerCase()}`, html: emailLayout({ title: `Expense ${data.decision.toLowerCase()}`, ...data, actionLabel: "View expense" }) });
