// routes/reports.js
// Flexible, filterable data for the printable Reports page: inventory status,
// and requisitions (which can be sliced into "by department" / "by person" /
// "by status" summaries, and any date range / day / month / year window) —
// all driven by the same query-building block so every report honors the same
// filters consistently. The client renders the actual printable HTML (with
// letterhead + watermark); this endpoint just returns clean, filtered data.
const express = require("express");
const { db, SIGNOFF_ROLES } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/inventory", (req, res) => {
  const { q, category_id, status } = req.query;
  let sql = `
    SELECT i.*, c.name AS category_name, c.code AS category_code
    FROM items i LEFT JOIN categories c ON c.id = i.category_id
    WHERE i.is_active = 1`;
  const params = [];
  if (category_id) {
    sql += " AND i.category_id = ?";
    params.push(category_id);
  }
  if (q) {
    sql += " AND (i.name LIKE ? OR i.code LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY c.name ASC, i.name ASC";

  let items = db.prepare(sql).all(...params);
  if (status === "low") items = items.filter((i) => i.quantity_on_hand <= i.reorder_level);
  if (status === "healthy") items = items.filter((i) => i.quantity_on_hand > i.reorder_level);

  const pkgStmt = db.prepare("SELECT * FROM item_packagings WHERE item_id = ? AND is_active = 1 ORDER BY units_per_pack DESC");
  items = items.map((i) => ({ ...i, packagings: pkgStmt.all(i.id) }));

  const summary = {
    totalItems: items.length,
    totalOnHandLines: items.length,
    lowStockCount: items.filter((i) => i.quantity_on_hand <= i.reorder_level).length,
    byCategory: {},
  };
  for (const i of items) {
    const key = i.category_name || "Uncategorized";
    summary.byCategory[key] = (summary.byCategory[key] || 0) + 1;
  }

  res.json({ items, summary, generated_at: new Date().toISOString() });
});

function buildRequisitionFilter(req) {
  const { status, department_id, date_from, date_to, q } = req.query;
  let hodId = req.query.hod_id;

  let where = "WHERE 1=1";
  const params = [];
  let extraJoin = "";

  if (req.user.role === "hod") {
    where += " AND r.hod_id = ?";
    params.push(req.user.id);
  } else if (SIGNOFF_ROLES.includes(req.user.role) && req.user.role !== "requester") {
    extraJoin = " JOIN signoffs sf ON sf.requisition_id = r.id AND sf.role_label = ? ";
    params.unshift(req.user.role);
    if (hodId) {
      where += " AND r.hod_id = ?";
      params.push(hodId);
    }
  } else if (hodId) {
    where += " AND r.hod_id = ?";
    params.push(hodId);
  }

  if (status) {
    where += " AND r.status = ?";
    params.push(status);
  }
  if (department_id) {
    where += " AND r.department_id = ?";
    params.push(department_id);
  }
  if (date_from) {
    where += " AND r.created_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND r.created_at <= ?";
    params.push(date_to);
  }
  if (q) {
    where += " AND (r.req_no LIKE ? OR r.purpose LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }

  return { where, params, extraJoin };
}

router.get("/requisitions", (req, res) => {
  const { where, params, extraJoin } = buildRequisitionFilter(req);

  const rows = db
    .prepare(
      `SELECT r.*, u.name AS hod_name, u.email AS hod_email, d.name AS department_name_current
       FROM requisitions r
       JOIN users u ON u.id = r.hod_id
       LEFT JOIN departments d ON d.id = r.department_id
       ${extraJoin}
       ${where}
       ORDER BY r.created_at DESC`
    )
    .all(...params);

  const lineStmt = db.prepare(
    `SELECT ri.*, i.code AS item_code, i.name AS item_name, i.unit
     FROM requisition_items ri JOIN items i ON i.id = ri.item_id
     WHERE ri.requisition_id = ?`
  );
  const withLines = rows.map((r) => ({ ...r, lines: lineStmt.all(r.id) }));

  const summary = {
    totalCount: rows.length,
    byStatus: {},
    byDepartment: {},
    byPerson: {},
  };
  for (const r of rows) {
    summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
    const deptKey = r.department_name_current || r.department || "Unspecified";
    summary.byDepartment[deptKey] = (summary.byDepartment[deptKey] || 0) + 1;
    const personKey = r.hod_name || "Unknown";
    summary.byPerson[personKey] = (summary.byPerson[personKey] || 0) + 1;
  }

  res.json({ requisitions: withLines, summary, generated_at: new Date().toISOString() });
});

module.exports = router;
