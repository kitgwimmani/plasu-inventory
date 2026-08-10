// routes/departments.js
// Departments are a proper relational table now (not free text): any authenticated
// user may view the list (needed to populate dropdowns), but only superadmin/ictadmin
// may create or edit them. Departments already in use are deactivated rather than
// deleted, to keep historical users/requisitions intact.
const express = require("express");
const { db, audit, nowIso, nextDeptCode } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const CAN_MANAGE = ["superadmin", "ictadmin"];

router.get("/", (req, res) => {
  const { q, include_inactive } = req.query;
  let sql = `
    SELECT d.*,
      (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS user_count,
      (SELECT COUNT(*) FROM requisitions r WHERE r.department_id = d.id) AS requisition_count
    FROM departments d WHERE 1=1`;
  const params = [];
  if (!include_inactive || include_inactive === "0") sql += " AND d.is_active = 1";
  if (q) {
    sql += " AND (d.name LIKE ? OR d.code LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY d.name ASC";
  const departments = db.prepare(sql).all(...params);
  res.json({ departments });
});

router.post("/", requireRole(...CAN_MANAGE), (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Department name is required." });
  }
  const existing = db.prepare("SELECT id FROM departments WHERE name = ?").get(name.trim());
  if (existing) {
    return res.status(409).json({ error: "A department with this name already exists." });
  }
  const code = nextDeptCode(name.trim());
  const info = db
    .prepare(`INSERT INTO departments(name, code, is_active, created_by, created_at) VALUES (?,?,1,?,?)`)
    .run(name.trim(), code, req.user.id, nowIso());

  audit(req.user.id, req.user.email, "CREATE_DEPARTMENT", "DEPARTMENT", info.lastInsertRowid, { name });
  const department = db.prepare("SELECT * FROM departments WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ department });
});

router.put("/:id", requireRole(...CAN_MANAGE), (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body || {};
  const department = db.prepare("SELECT * FROM departments WHERE id = ?").get(id);
  if (!department) return res.status(404).json({ error: "Department not found." });

  if (name && name.trim() !== department.name) {
    const clash = db.prepare("SELECT id FROM departments WHERE name = ? AND id != ?").get(name.trim(), id);
    if (clash) return res.status(409).json({ error: "Another department already has this name." });
  }

  db.prepare(
    `UPDATE departments SET name = COALESCE(?, name), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?`
  ).run(name ? name.trim() : null, is_active === undefined ? null : is_active, nowIso(), id);

  audit(req.user.id, req.user.email, "UPDATE_DEPARTMENT", "DEPARTMENT", id, req.body);
  const updated = db.prepare("SELECT * FROM departments WHERE id = ?").get(id);
  res.json({ department: updated });
});

module.exports = router;
