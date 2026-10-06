// routes/reports.js
// Flexible, filterable data for every report on the Reports page: inventory
// status, low-stock/reorder, stock movements (receipts), requisitions (sliceable
// by department/person/status/category/subcategory and any date window),
// department consumption summaries, requisition clearance (Head of Store +
// Issuance Officer signatures) and stock-receipt clearance (the batched
// Technical Expert / Audit Officer / Asset Officer sign-off on clearance
// requests) — all driven by the same query-building blocks so every report
// honors the same filters consistently. The client renders the actual
// printable HTML (with letterhead + watermark) and handles CSV/PDF export;
// this endpoint just returns clean, filtered JSON.
const express = require("express");
const { db, SIGNOFF_ROLES, CLEARANCE_ROLES } = require("../db/init");
const { requireAuth, requireRole, hasRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Roles that can see every requisition / department's data (mirrors
// client/src/context/AuthContext.js's FULL_ACCESS_ROLES).
const FULL_ACCESS_ROLES = ["superadmin", "ictadmin", "head_of_store", "issuance_officer"];
// Who may view the stock-receiving ledger: the people who record receipts,
// plus the three officers who clear them in batches (read-only for them).
const STOCK_MOVEMENT_ROLES = ["superadmin", "ictadmin", "head_of_store", ...CLEARANCE_ROLES];

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

// ---------------------------------------------------------------------------
// Low stock / reorder — a focused, actionable slice of inventory for whoever
// needs to decide what to buy next. Includes a simple reorder suggestion
// (bring the item back up to double its reorder level) and a severity ratio
// so the most critical shortages sort to the top.
// ---------------------------------------------------------------------------
router.get("/low-stock", (req, res) => {
  const { q, category_id, subcategory_id, department_id } = req.query;
  let sql = `
    SELECT i.*, c.name AS category_name, c.code AS category_code,
           s.name AS subcategory_name, d.name AS department_name
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN subcategories s ON s.id = i.subcategory_id
    LEFT JOIN departments d ON d.id = i.department_id
    WHERE i.is_active = 1 AND i.quantity_on_hand <= i.reorder_level`;
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
  sql += " ORDER BY i.name ASC";

  let items = db.prepare(sql).all(...params);
  items = items.map((i) => {
    const deficit = Math.max(i.reorder_level - i.quantity_on_hand, 0);
    const suggestedOrderQty = Math.max(i.reorder_level * 2 - i.quantity_on_hand, i.reorder_level, 0);
    const severity = i.reorder_level > 0 ? i.quantity_on_hand / i.reorder_level : 0;
    return { ...i, deficit, suggested_order_qty: suggestedOrderQty, severity_ratio: severity };
  });
  items.sort((a, b) => a.severity_ratio - b.severity_ratio);

  const summary = {
    totalLowStock: items.length,
    outOfStockCount: items.filter((i) => i.quantity_on_hand <= 0).length,
    totalDeficitUnits: items.reduce((sum, i) => sum + i.deficit, 0),
    byCategory: {},
  };
  for (const i of items) {
    const key = i.category_name || "Uncategorized";
    summary.byCategory[key] = (summary.byCategory[key] || 0) + 1;
  }

  res.json({ items, summary, generated_at: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Stock movements (receipts) — history of goods received into the store,
// including whether each receipt has been swept into a stock-receipt
// clearance request yet (and that request's status). Restricted to the
// roles that record receipts plus the three officers who clear them.
// ---------------------------------------------------------------------------
router.get("/stock-movements", requireRole(...STOCK_MOVEMENT_ROLES), (req, res) => {
  const { q, item_id, category_id, date_from, date_to, clearance_status } = req.query;
  let sql = `
    SELECT sr.*, i.code AS item_code, i.name AS item_name, i.unit,
           c.name AS category_name, u.name AS received_by_name,
           p.label AS packaging_label,
           cr.ref_no AS clearance_ref_no, cr.status AS clearance_status
    FROM stock_receipts sr
    JOIN items i ON i.id = sr.item_id
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN users u ON u.id = sr.received_by
    LEFT JOIN item_packagings p ON p.id = sr.packaging_id
    LEFT JOIN clearance_requests cr ON cr.id = sr.clearance_request_id
    WHERE 1=1`;
  const params = [];
  if (item_id) {
    sql += " AND sr.item_id = ?";
    params.push(item_id);
  }
  if (category_id) {
    sql += " AND i.category_id = ?";
    params.push(category_id);
  }
  if (date_from) {
    sql += " AND sr.created_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    sql += " AND sr.created_at <= ?";
    params.push(date_to);
  }
  if (q) {
    sql += " AND (i.name LIKE ? OR i.code LIKE ? OR sr.remarks LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY sr.created_at DESC";

  let receipts = db.prepare(sql).all(...params);
  if (clearance_status === "uncleared") receipts = receipts.filter((r) => r.clearance_status !== "cleared");
  if (clearance_status === "cleared") receipts = receipts.filter((r) => r.clearance_status === "cleared");

  const summary = {
    totalReceipts: receipts.length,
    totalUnitsReceived: receipts.reduce((sum, r) => sum + r.qty, 0),
    unclearedCount: receipts.filter((r) => r.clearance_status !== "cleared").length,
    byItem: {},
    byCategory: {},
  };
  for (const r of receipts) {
    const itemKey = `${r.item_name} (${r.item_code})`;
    summary.byItem[itemKey] = (summary.byItem[itemKey] || 0) + r.qty;
    const catKey = r.category_name || "Uncategorized";
    summary.byCategory[catKey] = (summary.byCategory[catKey] || 0) + r.qty;
  }

  res.json({ receipts, summary, generated_at: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Requisitions
// ---------------------------------------------------------------------------
function buildRequisitionFilter(req) {
  const { status, department_id, category_id, subcategory_id, date_from, date_to, q } = req.query;
  const hodId = req.query.hod_id;

  let where = "WHERE 1=1";
  const params = [];

  // A requester who is only an HOD sees their own; broader roles see everything.
  if (hasRole(req.user, "hod") && !hasRole(req.user, ...FULL_ACCESS_ROLES)) {
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

// ---------------------------------------------------------------------------
// Department summary — consumption / activity rolled up per department, the
// cross-department comparison view management actually wants. A HOD (who
// holds no broader role) is always scoped to their own department; everyone
// else may compare across all of them or drill into one.
// ---------------------------------------------------------------------------
router.get("/department-summary", (req, res) => {
  const scopedToOwn = hasRole(req.user, "hod") && !hasRole(req.user, ...FULL_ACCESS_ROLES);
  let departmentId = req.query.department_id || null;
  if (scopedToOwn) departmentId = req.user.department_id || null;
  const { date_from, date_to } = req.query;

  let reqWhere = "WHERE 1=1";
  const reqParams = [];
  if (date_from) {
    reqWhere += " AND r.created_at >= ?";
    reqParams.push(date_from);
  }
  if (date_to) {
    reqWhere += " AND r.created_at <= ?";
    reqParams.push(date_to);
  }
  if (scopedToOwn && !departmentId) {
    // An HOD account with no department on file sees nothing rather than everything.
    return res.json({ departments: [], summary: { totalDepartments: 0, totalRequisitions: 0, totalUnitsIssued: 0 }, generated_at: new Date().toISOString() });
  }
  if (departmentId) {
    reqWhere += " AND r.department_id = ?";
    reqParams.push(departmentId);
  }

  const requisitions = db
    .prepare(
      `SELECT r.*, d.name AS department_name_current, d.id AS dept_id
       FROM requisitions r LEFT JOIN departments d ON d.id = r.department_id
       ${reqWhere}`
    )
    .all(...reqParams);

  const lineStmt = db.prepare(
    `SELECT ri.qty_requested, COALESCE(i.name, ri.adhoc_name) AS item_name, COALESCE(i.unit, ri.adhoc_unit) AS unit
     FROM requisition_items ri LEFT JOIN items i ON i.id = ri.item_id
     WHERE ri.requisition_id = ?`
  );

  const byDept = new Map();
  for (const r of requisitions) {
    const key = r.dept_id || `unassigned:${r.department || "Unspecified"}`;
    if (!byDept.has(key)) {
      byDept.set(key, {
        department_id: r.dept_id || null,
        department_name: r.department_name_current || r.department || "Unspecified",
        totalRequisitions: 0,
        byStatus: { pending: 0, recommended: 0, approved: 0, issued: 0, rejected: 0 },
        totalUnitsIssued: 0,
        itemTotals: {},
      });
    }
    const bucket = byDept.get(key);
    bucket.totalRequisitions += 1;
    bucket.byStatus[r.status] = (bucket.byStatus[r.status] || 0) + 1;
    if (r.status === "issued") {
      const lines = lineStmt.all(r.id);
      for (const l of lines) {
        bucket.totalUnitsIssued += l.qty_requested;
        bucket.itemTotals[l.item_name] = (bucket.itemTotals[l.item_name] || 0) + l.qty_requested;
      }
    }
  }

  const departments = [...byDept.values()].map((d) => ({
    ...d,
    topItems: Object.entries(d.itemTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ item_name: name, qty })),
  }));
  departments.sort((a, b) => b.totalRequisitions - a.totalRequisitions);

  const summary = {
    totalDepartments: departments.length,
    totalRequisitions: requisitions.length,
    totalUnitsIssued: departments.reduce((sum, d) => sum + d.totalUnitsIssued, 0),
  };

  // When scoped to exactly one department, also include the raw requisition list
  // (with lines) so the detail view/print can show the underlying transactions.
  let detail = null;
  if (departmentId && departments.length <= 1) {
    const reqLineStmt = db.prepare(
      `SELECT ri.*,
              COALESCE(i.code, '—') AS item_code,
              COALESCE(i.name, ri.adhoc_name) AS item_name,
              COALESCE(i.unit, ri.adhoc_unit) AS unit
       FROM requisition_items ri LEFT JOIN items i ON i.id = ri.item_id
       WHERE ri.requisition_id = ?`
    );
    detail = requisitions
      .map((r) => ({ ...r, lines: reqLineStmt.all(r.id) }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  res.json({ departments, summary, detail, generated_at: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Requisition clearance status — turnaround and bottleneck visibility for the
// two-party clearance sheet (Head of Store signs first, then the Issuance
// Officer) that gates issuing an approved requisition.
// ---------------------------------------------------------------------------
router.get("/signoffs", (req, res) => {
  const { department_id, date_from, date_to, only_pending } = req.query;

  let where = "WHERE r.status IN ('approved','issued')";
  const params = [];
  if (department_id) {
    where += " AND r.department_id = ?";
    params.push(department_id);
  }
  if (date_from) {
    where += " AND r.approved_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND r.approved_at <= ?";
    params.push(date_to);
  }

  const requisitions = db
    .prepare(
      `SELECT r.*, u.name AS hod_name, d.name AS department_name_current
       FROM requisitions r
       JOIN users u ON u.id = r.hod_id
       LEFT JOIN departments d ON d.id = r.department_id
       ${where}
       ORDER BY r.approved_at DESC`
    )
    .all(...params);

  const signoffStmt = db.prepare("SELECT * FROM signoffs WHERE requisition_id = ?");

  let rows = requisitions.map((r) => {
    const signoffs = signoffStmt.all(r.id);
    const byRole = {};
    for (const role of SIGNOFF_ROLES) {
      const s = signoffs.find((x) => x.role_label === role);
      byRole[role] = { signed: !!(s && s.signed), signed_by_name: s?.signed_by_name || null, signed_at: s?.signed_at || null };
    }
    const fullyCleared = SIGNOFF_ROLES.every((role) => byRole[role].signed);
    const pendingRoles = SIGNOFF_ROLES.filter((role) => !byRole[role].signed);
    const turnaroundHours =
      r.status === "issued" && r.issued_at && r.approved_at
        ? (new Date(r.issued_at) - new Date(r.approved_at)) / 36e5
        : null;
    return {
      id: r.id,
      req_no: r.req_no,
      department_name_current: r.department_name_current,
      department: r.department,
      hod_name: r.hod_name,
      status: r.status,
      approved_at: r.approved_at,
      issued_at: r.issued_at,
      signoffs: byRole,
      fully_cleared: fullyCleared,
      pending_roles: pendingRoles,
      turnaround_hours: turnaroundHours,
    };
  });

  if (only_pending === "1") rows = rows.filter((r) => !r.fully_cleared);

  const summary = {
    totalCount: rows.length,
    fullyCleared: rows.filter((r) => r.fully_cleared).length,
    pendingCount: rows.filter((r) => !r.fully_cleared).length,
    pendingByRole: {},
    averageTurnaroundHours: null,
  };
  for (const role of SIGNOFF_ROLES) {
    summary.pendingByRole[role] = rows.filter((r) => !r.signoffs[role].signed && r.status === "approved").length;
  }
  const turnarounds = rows.map((r) => r.turnaround_hours).filter((h) => h !== null);
  if (turnarounds.length) {
    summary.averageTurnaroundHours = turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length;
  }

  res.json({ requisitions: rows, summary, generated_at: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Stock-receipt clearance — batch-level turnaround and bottleneck visibility
// for clearance_requests, the date-range bundles of stock receipts the Head
// of Store submits for the Technical Expert / Audit Officer / Asset Officer
// to sign off on. Distinct from requisition clearance above: this tracks the
// receiving side of the ledger, not the issuing side.
// ---------------------------------------------------------------------------
router.get("/stock-clearance", requireRole(...FULL_ACCESS_ROLES, ...CLEARANCE_ROLES), (req, res) => {
  const { status, date_from, date_to, only_pending } = req.query;

  let where = "WHERE 1=1";
  const params = [];
  if (status) {
    where += " AND c.status = ?";
    params.push(status);
  }
  if (date_from) {
    where += " AND c.created_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND c.created_at <= ?";
    params.push(date_to);
  }

  const requests = db
    .prepare(
      `SELECT c.*, u.name AS created_by_name,
         (SELECT COUNT(*) FROM stock_receipts sr WHERE sr.clearance_request_id = c.id) AS receipt_count,
         (SELECT COALESCE(SUM(sr.qty),0) FROM stock_receipts sr WHERE sr.clearance_request_id = c.id) AS total_qty
       FROM clearance_requests c
       JOIN users u ON u.id = c.created_by
       ${where}
       ORDER BY c.created_at DESC`
    )
    .all(...params);

  const signoffStmt = db.prepare("SELECT * FROM clearance_signoffs WHERE clearance_request_id = ?");

  let rows = requests.map((c) => {
    const signoffs = signoffStmt.all(c.id);
    const byRole = {};
    for (const role of CLEARANCE_ROLES) {
      const s = signoffs.find((x) => x.role_label === role);
      byRole[role] = { signed: !!(s && s.signed), signed_by_name: s?.signed_by_name || null, signed_at: s?.signed_at || null };
    }
    const fullyCleared = c.status === "cleared";
    const pendingRoles = CLEARANCE_ROLES.filter((role) => !byRole[role].signed);
    const turnaroundHours =
      fullyCleared && c.cleared_at
        ? (new Date(c.cleared_at) - new Date(c.created_at)) / 36e5
        : null;
    return {
      id: c.id,
      ref_no: c.ref_no,
      date_from: c.date_from,
      date_to: c.date_to,
      status: c.status,
      created_by_name: c.created_by_name,
      created_at: c.created_at,
      cleared_at: c.cleared_at,
      receipt_count: c.receipt_count,
      total_qty: c.total_qty,
      signoffs: byRole,
      fully_cleared: fullyCleared,
      pending_roles: pendingRoles,
      turnaround_hours: turnaroundHours,
    };
  });

  if (only_pending === "1") rows = rows.filter((r) => !r.fully_cleared);

  const summary = {
    totalCount: rows.length,
    fullyCleared: rows.filter((r) => r.fully_cleared).length,
    pendingCount: rows.filter((r) => !r.fully_cleared).length,
    pendingByRole: {},
    averageTurnaroundHours: null,
  };
  for (const role of CLEARANCE_ROLES) {
    summary.pendingByRole[role] = rows.filter((r) => !r.signoffs[role].signed && r.status === "pending").length;
  }
  const turnarounds = rows.map((r) => r.turnaround_hours).filter((h) => h !== null);
  if (turnarounds.length) {
    summary.averageTurnaroundHours = turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length;
  }

  res.json({ clearance_requests: rows, summary, generated_at: new Date().toISOString() });
});

module.exports = router;
