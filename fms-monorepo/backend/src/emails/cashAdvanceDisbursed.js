import { emailLayout } from "./base.js";
export default (data) => ({ subject: "Cash advance disbursed", html: emailLayout({ title: "Funds disbursed", ...data, actionLabel: "View cash advance" }) });
