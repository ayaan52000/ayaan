import { emailLayout } from "./base.js";
export default (data) => ({ subject: `Cash advance ${data.decision.toLowerCase()}`, html: emailLayout({ title: `Cash advance ${data.decision.toLowerCase()}`, ...data, actionLabel: "View cash advance" }) });
