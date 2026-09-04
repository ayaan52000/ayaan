import { emailLayout } from "./base.js";
export default (data) => ({ subject: "Cash advance awaiting approval", html: emailLayout({ title: "Cash advance requested", ...data, actionLabel: "Review cash advance" }) });
