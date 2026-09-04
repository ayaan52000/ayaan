import { emailLayout } from "./base.js";
export default (data) => ({ subject: "Fund utilization reached 90%", html: emailLayout({ title: "Fund spending warning", ...data, actionLabel: "Review fund" }) });
