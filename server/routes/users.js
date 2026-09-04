// routes/users.js
// Only superadmin and ictadmin may create/manage user accounts. Every field —
// including name and email — can be corrected after the fact via PUT /:id.
// A user can hold several roles at once; they are chosen as checkboxes and stored
// in the user_roles table (see db/init.js). `users.role` is the derived primary.
const express = require("express");
const bcrypt = require("bcryptjs");
const { db, audit, nowIso, ROLES, rolesForUser, setUserRoles, primaryRole } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

const USER_COLUMNS = `u.id, u.name, u.email, u.role, u.department, u.department_id, d.name AS department_name,
  u.is_active, u.created_at, u.updated_at`;

function withRoles(user) {
  if (!user) return user;
  const roles = rolesForUser(user.id);
  return { ...user, roles: roles.length ? roles : [user.role] };
}

// Normalise the roles payload: accept `roles: []` (preferred) or a single `role`.
function readRoles(body) {
  let roles = Array.isArray(body.roles) ? body.roles : body.role ? [body.role] : [];
  roles = [...new Set(roles.filter((r) => ROLES.includes(r)))];
  return roles;
}

// Lightweight list of HODs (requesters) for report "by person" filters and
// department-assignment lookups.
router.get("/hods", requireRole("superadmin", "ictadmin", "head_of_store"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT u.id, u.name, u.email, u.department_id, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.role = 'hod' OR ur.role = 'hod'
       ORDER BY u.name ASC`
    )
    .all();
  res.json({ users: rows });
});

router.get("/", requireRole("superadmin", "ictadmin"), (req, res) => {
  const { q, role, department_id, status } = req.query;
  let sql = `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE 1=1`;
  const params = [];
  if (q) {
    sql += " AND (u.name LIKE ? OR u.email LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  if (role) {
    sql += " AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = ?)";
    params.push(role);
  }
  if (department_id) {
    sql += " AND u.department_id = ?";
    params.push(department_id);
  }
  if (status === "active") sql += " AND u.is_active = 1";
  if (status === "inactive") sql += " AND u.is_active = 0";
  sql += " ORDER BY u.created_at DESC";

  const users = db.prepare(sql).all(...params).map(withRoles);
  res.json({ users });
});

router.post("/", requireRole("superadmin", "ictadmin"), (req, res) => {
  const { name, email, password, department_id } = req.body || {};
  const roles = readRoles(req.body || {});
  if (!name || !email || !password || roles.length === 0) {
    return res.status(400).json({ error: "Name, email, password and at least one role are required." });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const emailNorm = String(email).toLowerCase().trim();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(emailNorm);
  if (existing) {
    return res.status(409).json({ error: "A user with this email already exists." });
  }

  let departmentName = null;
  if (department_id) {
    const dept = db.prepare("SELECT * FROM departments WHERE id = ?").get(department_id);
    if (!dept) return res.status(400).json({ error: "Selected department was not found." });
    departmentName = dept.name;
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO users(name, email, password_hash, role, department, department_id, is_active, created_by, created_at)
       VALUES (?,?,?,?,?,?,1,?,?)`
    )
    .run(name, emailNorm, hash, primaryRole(roles), departmentName, department_id || null, req.user.id, nowIso());
  setUserRoles(info.lastInsertRowid, roles);

  audit(req.user.id, req.user.email, "CREATE_USER", "USER", info.lastInsertRowid, { email: emailNorm, roles });
  const user = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`)
    .get(info.lastInsertRowid);
  res.status(201).json({ user: withRoles(user) });
});

router.put("/:id", requireRole("superadmin", "ictadmin"), (req, res) => {
  const { id } = req.params;
  const { name, email, department_id, is_active } = req.body || {};
  const rolesProvided = req.body && (Array.isArray(req.body.roles) || req.body.role !== undefined);
  const roles = readRoles(req.body || {});
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "User not found." });

  if (rolesProvided && roles.length === 0) {
    return res.status(400).json({ error: "A user must have at least one valid role." });
  }

  let emailNorm = null;
  if (email) {
    emailNorm = String(email).toLowerCase().trim();
    const clash = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(emailNorm, id);
    if (clash) return res.status(409).json({ error: "Another account already uses this email." });
  }

  let departmentName = null;
  if (department_id !== undefined) {
    if (department_id) {
      const dept = db.prepare("SELECT * FROM departments WHERE id = ?").get(department_id);
      if (!dept) return res.status(400).json({ error: "Selected department was not found." });
      departmentName = dept.name;
    } else {
      departmentName = "";
    }
  }

  // Prevent locking out the last active superadmin account.
  const currentRoles = rolesForUser(user.id);
  const wasSuperadmin = currentRoles.includes("superadmin") || user.role === "superadmin";
  const losesSuperadmin = rolesProvided && !roles.includes("superadmin");
  if (wasSuperadmin && (losesSuperadmin || is_active === 0)) {
    const otherActiveSuperadmins = db
      .prepare(
        `SELECT COUNT(*) AS c FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         WHERE ur.role='superadmin' AND u.is_active=1 AND u.id != ?`
      )
      .get(id).c;
    if (otherActiveSuperadmins === 0) {
      return res.status(400).json({ error: "Cannot remove or deactivate the last active superadmin." });
    }
  }

  db.prepare(
    `UPDATE users SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      department = CASE WHEN ? THEN ? ELSE department END,
      department_id = CASE WHEN ? THEN ? ELSE department_id END,
      is_active = COALESCE(?, is_active),
      updated_at = ?,
      updated_by = ?
     WHERE id = ?`
  ).run(
    name || null,
    emailNorm,
    department_id !== undefined ? 1 : 0,
    departmentName,
    department_id !== undefined ? 1 : 0,
    department_id || null,
    is_active === undefined ? null : is_active,
    nowIso(),
    req.user.id,
    id
  );

  if (rolesProvided) setUserRoles(Number(id), roles);

  audit(req.user.id, req.user.email, "UPDATE_USER", "USER", id, {
    name,
    email: emailNorm,
    roles: rolesProvided ? roles : undefined,
    department_id,
    is_active,
  });
  const updated = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`)
    .get(id);
  res.json({ user: withRoles(updated) });
});

router.post("/:id/reset-password", requireRole("superadmin", "ictadmin"), (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "User not found." });

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
  audit(req.user.id, req.user.email, "RESET_PASSWORD", "USER", id, {});
  res.json({ ok: true });
});

module.exports = router;
