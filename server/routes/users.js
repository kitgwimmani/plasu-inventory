// routes/users.js
// Only superadmin and ictadmin may create/manage user accounts. Every field —
// including name and email — can be corrected after the fact via PUT /:id.
const express = require("express");
const bcrypt = require("bcryptjs");
const { db, audit, nowIso, ROLES } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

const USER_COLUMNS = `u.id, u.name, u.email, u.role, u.department, u.department_id, d.name AS department_name,
  u.is_active, u.created_at, u.updated_at`;

// Lightweight list of HODs (requesters) for report "by person" filters and
// department-assignment lookups. Available to back-office roles, not just
// full user-management admins.
router.get("/hods", requireRole("superadmin", "ictadmin", "inventoryadmin"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.department_id, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.role = 'hod' ORDER BY u.name ASC`
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
    sql += " AND u.role = ?";
    params.push(role);
  }
  if (department_id) {
    sql += " AND u.department_id = ?";
    params.push(department_id);
  }
  if (status === "active") sql += " AND u.is_active = 1";
  if (status === "inactive") sql += " AND u.is_active = 0";
  sql += " ORDER BY u.created_at DESC";

  const users = db.prepare(sql).all(...params);
  res.json({ users });
});

router.post("/", requireRole("superadmin", "ictadmin"), (req, res) => {
  const { name, email, password, role, department_id } = req.body || {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Name, email, password and role are required." });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "Invalid role specified." });
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
    .run(name, emailNorm, hash, role, departmentName, department_id || null, req.user.id, nowIso());

  audit(req.user.id, req.user.email, "CREATE_USER", "USER", info.lastInsertRowid, { email: emailNorm, role });
  const user = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`)
    .get(info.lastInsertRowid);
  res.status(201).json({ user });
});

router.put("/:id", requireRole("superadmin", "ictadmin"), (req, res) => {
  const { id } = req.params;
  const { name, email, role, department_id, is_active } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "User not found." });

  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: "Invalid role specified." });
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
  if ((role && role !== "superadmin" && user.role === "superadmin") || is_active === 0) {
    if (user.role === "superadmin") {
      const activeSuperadmins = db
        .prepare("SELECT COUNT(*) AS c FROM users WHERE role='superadmin' AND is_active=1 AND id != ?")
        .get(id).c;
      if (activeSuperadmins === 0) {
        return res.status(400).json({ error: "Cannot remove or deactivate the last active superadmin." });
      }
    }
  }

  db.prepare(
    `UPDATE users SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      department = CASE WHEN ? THEN ? ELSE department END,
      department_id = CASE WHEN ? THEN ? ELSE department_id END,
      is_active = COALESCE(?, is_active),
      updated_at = ?,
      updated_by = ?
     WHERE id = ?`
  ).run(
    name || null,
    emailNorm,
    role || null,
    department_id !== undefined ? 1 : 0,
    departmentName,
    department_id !== undefined ? 1 : 0,
    department_id || null,
    is_active === undefined ? null : is_active,
    nowIso(),
    req.user.id,
    id
  );

  audit(req.user.id, req.user.email, "UPDATE_USER", "USER", id, { name, email: emailNorm, role, department_id, is_active });
  const updated = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`)
    .get(id);
  res.json({ user: updated });
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
