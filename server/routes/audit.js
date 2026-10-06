// routes/audit.js
const express = require("express");
const { db } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Supports the same filters the Audit Log page / report exposes: a free-text
// search across actor/entity/details, an exact action filter, and a date
// range. `limit` defaults to 300 for the normal page view; pass a higher
// value (or 0 for "no limit") when exporting a filtered report to CSV/PDF so
// the export isn't silently truncated.
router.get("/", requireRole("superadmin", "ictadmin"), (req, res) => {
  const { q, action, date_from, date_to } = req.query;
  let limit = Number(req.query.limit);
  if (!Number.isFinite(limit)) limit = 300;

  let sql = `
    SELECT a.*, u.name AS actor_name
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE 1=1`;
  const params = [];
  if (action) {
    sql += " AND a.action = ?";
    params.push(action);
  }
  if (date_from) {
    sql += " AND a.created_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    sql += " AND a.created_at <= ?";
    params.push(date_to);
  }
  if (q) {
    sql += " AND (u.name LIKE ? OR a.actor_email LIKE ? OR a.entity_type LIKE ? OR a.details LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY a.id DESC";
  if (limit > 0) {
    sql += " LIMIT ?";
    params.push(limit);
  }

  const logs = db.prepare(sql).all(...params);
  res.json({ logs });
});

module.exports = router;
