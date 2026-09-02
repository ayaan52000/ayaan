const validModes = new Set(["off", "warn", "block"]);

export function budgetMode() {
  const configured = (process.env.BUDGET_ENFORCEMENT ?? "warn").toLowerCase();
  return validModes.has(configured) ? configured : "warn";
}

export function budgetMessage(category, projectedTotal) {
  if (projectedTotal <= Number(category.budgetCap)) return null;
  return `${category.name} monthly budget exceeded: ${projectedTotal} of ${category.budgetCap}`;
}
