// middleware/auth.js
const jwt = require("jsonwebtoken");
const { db, rolesForUser } = require("../db/init");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// A user may hold several roles. `req.user.role` is the single primary role
// (for display / dashboard routing); `req.user.roles` is the full set and is
// what permission checks should use.
function hasRole(user, ...roles) {
  if (!user) return false;
  const set = user.roles && user.roles.length ? user.roles : [user.role];
  return roles.some((r) => set.includes(r));
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare("SELECT id, name, email, role, department, department_id, is_active FROM users WHERE id = ?")
      .get(payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Account not found or deactivated." });
    }
    user.roles = rolesForUser(user.id);
    if (user.roles.length === 0) user.roles = [user.role];
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}

// Strict role enforcement: the user must hold at least one of the listed roles.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!hasRole(req.user, ...allowedRoles)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, hasRole, JWT_SECRET };
