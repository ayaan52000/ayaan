import { env } from "./env.js";
import cashAdvanceRequested from "../emails/cashAdvanceRequested.js";
import cashAdvanceDecision from "../emails/cashAdvanceDecision.js";
import cashAdvanceDisbursed from "../emails/cashAdvanceDisbursed.js";
import expenseSubmitted from "../emails/expenseSubmitted.js";
import expenseDecision from "../emails/expenseDecision.js";
import fundThreshold from "../emails/fundThreshold.js";

const deliveries = new Map();
const rolePaths = { FINANCE_HEAD: "finance-head", ACCOUNTS_HEAD: "accounts-head", BRANCH_MANAGER: "branch-manager", DATA_ENTRY_OPERATOR: "data-entry", PROGRAM_OFFICER: "program-officer", AUDITOR: "auditor" };

function withinRateLimit(userId) {
  const now = Date.now(); const recent = (deliveries.get(userId) ?? []).filter((time) => now - time < 60 * 60 * 1000);
  if (recent.length >= env.EMAIL_RATE_LIMIT_PER_HOUR) { deliveries.set(userId, recent); return false; }
  recent.push(now); deliveries.set(userId, recent); return true;
}

function templateFor(notification, data) {
  if (notification.entityType === "CashAdvance" && notification.type === "APPROVAL_PENDING") return cashAdvanceRequested(data);
  if (notification.entityType === "CashAdvance" && ["APPROVED", "REJECTED"].includes(notification.type)) return cashAdvanceDecision({ ...data, decision: notification.type === "APPROVED" ? "Approved" : "Rejected" });
  if (notification.entityType === "CashAdvance" && notification.type === "DISBURSED") return cashAdvanceDisbursed(data);
  if (notification.entityType === "Expense" && notification.type === "APPROVAL_PENDING") return expenseSubmitted(data);
  if (notification.entityType === "Expense" && ["APPROVED", "REJECTED"].includes(notification.type)) return expenseDecision({ ...data, decision: notification.type === "APPROVED" ? "Approved" : "Rejected" });
  if (notification.entityType === "Fund" && notification.type === "FUND_THRESHOLD") return fundThreshold(data);
  return null;
}

export function emailServiceStatus() {
  return { enabled: env.EMAIL_NOTIFICATIONS_ENABLED === "true" && env.EMAIL_PROVIDER !== "disabled", provider: env.EMAIL_PROVIDER, configured: env.EMAIL_PROVIDER === "console" || env.EMAIL_PROVIDER === "disabled" || Boolean(env.EMAIL_API_KEY) };
}

export async function sendEmail({ to, subject, html }) {
  const status = emailServiceStatus(); if (!status.enabled) return { skipped: "disabled" };
  if (env.EMAIL_PROVIDER === "console") { console.info("[email:console]", { from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`, to, subject, html }); return { provider: "console" }; }
  const resend = env.EMAIL_PROVIDER === "resend";
  const response = await fetch(resend ? "https://api.resend.com/emails" : "https://api.sendgrid.com/v3/mail/send", {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.EMAIL_API_KEY}` },
    body: JSON.stringify(resend ? { from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`, to: [to], subject, html } : { personalizations: [{ to: [{ email: to }] }], from: { email: env.EMAIL_FROM_ADDRESS, name: env.EMAIL_FROM_NAME }, subject, content: [{ type: "text/html", value: html }] }),
  });
  if (!response.ok) throw new Error(`${env.EMAIL_PROVIDER} email failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return { provider: env.EMAIL_PROVIDER, status: response.status };
}

export async function deliverNotificationEmail(user, notification) {
  if (!user?.emailNotificationsEnabled) return;
  const section = notification.entityType === "Expense" ? "expenses" : notification.entityType === "Fund" ? `funds/${notification.entityId}` : "cash-advances";
  const built = templateFor(notification, { greeting: `Hello ${user.name},`, message: notification.message, actionUrl: `${env.FRONTEND_URL}/${rolePaths[user.role]}/${section}` });
  if (!built) return;
  if (!withinRateLimit(user.id)) { console.info(`[email] Rate limit reached for user ${user.id}`); return; }
  await sendEmail({ to: user.email, ...built });
}

export function queueNotificationEmail(user, notification) {
  setImmediate(() => deliverNotificationEmail(user, notification).catch((error) => console.error("[email] Notification delivery failed", { userId: user.id, entityType: notification.entityType, entityId: notification.entityId, error: error.message })));
}
