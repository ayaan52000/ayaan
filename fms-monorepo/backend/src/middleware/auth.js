import jwt from "jsonwebtoken";
import { can } from "../lib/permissions.js";
import { env } from "../lib/env.js";

export function authenticate(req, res, next) {
  const [scheme, bearerToken] = (req.headers.authorization ?? "").split(" ");
  const token = req.cookies?.fms_session ?? (scheme === "Bearer" ? bearerToken : null);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = { id: payload.id, role: payload.role, branchId: payload.branchId };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requirePermission(action) {
  return (req, res, next) => {
    if (!can(req.user.role, action)) {
      return res.status(403).json({ error: "Insufficient permission" });
    }
    next();
  };
}
