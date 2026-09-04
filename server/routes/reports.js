// routes/reports.js
// Flexible, filterable data for the printable Reports page: inventory status and
// requisitions. The client renders the actual printable HTML (letterhead +
// watermark); this endpoint returns clean, filtered data + summaries.
const express = require("express");
const { db } = require("../db/init");
const { requireAuth, hasRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/inventory", (req, res) => {
  const { q, category_id, subcategory_id, department_id, status } = req.query;
  let sql = `
    SELECT i.*, c.name AS category_name, c.code AS category_code,
           s.name AS subcategory_name, s.code AS subcategory_code,
           d.name AS department_name
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN subcategories s ON s.id = i.subcategory_id
    LEFT JOIN departments d ON d.id = i.department_id
    WHERE i.is_active = 1`;
  const params = [];
  if (category_id) {
    sql += " AND i.category_id = ?";
    params.push(category_id);
  }
  if (subcategory_id) {
    sql += " AND i.subcategory_id = ?";
    params.push(subcategory_id);
  }
  if (department_id) {
    sql += " AND i.department_id = ?";
    params.push(department_id);
  }
  if (q) {
    sql += " AND (i.name LIKE ? OR i.code LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY c.name ASC, s.name ASC, i.name ASC";

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
    bySubcategory: {},
    byDepartment: {},
  };
  for (const i of items) {
    const cat = i.category_name || "Uncategorized";
    summary.byCategory[cat] = (summary.byCategory[cat] || 0) + 1;
    if (i.subcategory_name) summary.bySubcategory[i.subcategory_name] = (summary.bySubcategory[i.subcategory_name] || 0) + 1;
    if (i.department_name) summary.byDepartment[i.department_name] = (summary.byDepartment[i.department_name] || 0) + 1;
  }

  res.json({ items, summary, generated_at: new Date().toISOString() });
});

function buildRequisitionFilter(req) {
  const { status, department_id, category_id, subcategory_id, date_from, date_to, q } = req.query;
  const hodId = req.query.hod_id;

  let where = "WHERE 1=1";
  const params = [];

  // A requester who is only an HOD sees their own; broader roles see everything.
  if (hasRole(req.user, "hod") && !hasRole(req.user, "superadmin", "ictadmin", "head_of_store", "issuance_officer")) {
    where += " AND r.hod_id = ?";
    params.push(req.user.id);
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
  if (category_id) {
    where += ` AND EXISTS (SELECT 1 FROM requisition_items ri JOIN items i ON i.id = ri.item_id
               WHERE ri.requisition_id = r.id AND i.category_id = ?)`;
    params.push(category_id);
  }
  if (subcategory_id) {
    where += ` AND EXISTS (SELECT 1 FROM requisition_items ri JOIN items i ON i.id = ri.item_id
               WHERE ri.requisition_id = r.id AND i.subcategory_id = ?)`;
    params.push(subcategory_id);
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

  return { where, params };
}

router.get("/requisitions", (req, res) => {
  const { where, params } = buildRequisitionFilter(req);

  const rows = db
    .prepare(
      `SELECT r.*, u.name AS hod_name, u.email AS hod_email, d.name AS department_name_current
       FROM requisitions r
       JOIN users u ON u.id = r.hod_id
       LEFT JOIN departments d ON d.id = r.department_id
       ${where}
       ORDER BY r.created_at DESC`
    )
    .all(...params);

  const lineStmt = db.prepare(
    `SELECT ri.*,
            COALESCE(i.code, '—') AS item_code,
            COALESCE(i.name, ri.adhoc_name) AS item_name,
            COALESCE(i.unit, ri.adhoc_unit) AS unit
     FROM requisition_items ri LEFT JOIN items i ON i.id = ri.item_id
     WHERE ri.requisition_id = ?`
  );
  const withLines = rows.map((r) => ({ ...r, lines: lineStmt.all(r.id) }));

  const summary = { totalCount: rows.length, byStatus: {}, byDepartment: {}, byPerson: {} };
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
