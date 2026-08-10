// routes/requisitions.js
// Workflow:
//  1. HOD creates a requisition (status: pending) from available inventory items,
//     picking a packaging tier (e.g. "Pack of 12") and how many packs they need —
//     the server converts that to base units for stock accounting.
//  2. InventoryAdmin reviews and approves or rejects it.
//  3. On approval, a clearance sheet with 4 signoff slots is created
//     (requester, technical expert, audit officer, asset/insurance officer).
//  4. Once all four parties have signed, InventoryAdmin issues the item(s),
//     which deducts stock from inventory and closes the requisition.
// Every state change fires a notification to the people who need to act next or
// who raised the request, and the list endpoint supports the search/date-range/
// department/person filters used by the Requisitions page and printable reports.
const express = require("express");
const { db, audit, nowIso, nextReqNo, SIGNOFF_ROLES, notifyRoles, notifyUser, checkLowStockAndNotify } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function getFullRequisition(id) {
  const req = db.prepare(
    `SELECT r.*, u.name AS hod_name, u.email AS hod_email,
            d.name AS department_name_current,
            au.name AS approved_by_name, iu.name AS issued_by_name
     FROM requisitions r
     JOIN users u ON u.id = r.hod_id
     LEFT JOIN departments d ON d.id = r.department_id
     LEFT JOIN users au ON au.id = r.approved_by
     LEFT JOIN users iu ON iu.id = r.issued_by
     WHERE r.id = ?`
  ).get(id);
  if (!req) return null;

  const lines = db.prepare(
    `SELECT ri.*, i.code AS item_code, i.name AS item_name, i.unit, i.quantity_on_hand,
            p.label AS packaging_label, p.units_per_pack
     FROM requisition_items ri
     JOIN items i ON i.id = ri.item_id
     LEFT JOIN item_packagings p ON p.id = ri.packaging_id
     WHERE ri.requisition_id = ?`
  ).all(id);

  const signoffs = db.prepare(
    `SELECT role_label, signed, signed_by_name, signed_at FROM signoffs WHERE requisition_id = ?`
  ).all(id);

  return { ...req, lines, signoffs };
}

// List requisitions with optional filters, used by the Requisitions page and by
// the printable Reports page (date range / day / month / year presets are
// computed client-side into date_from/date_to; department_id and hod_id give the
// "by department" / "by person" report views; q searches req_no + purpose).
router.get("/", (req, res) => {
  const { status, department_id, date_from, date_to, q } = req.query;
  let hodId = req.query.hod_id;

  let sql = `
    SELECT r.*, u.name AS hod_name, d.name AS department_name_current
    FROM requisitions r
    JOIN users u ON u.id = r.hod_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE 1=1`;
  const params = [];

  if (req.user.role === "hod") {
    sql += " AND r.hod_id = ?";
    params.push(req.user.id);
  } else if (hodId) {
    sql += " AND r.hod_id = ?";
    params.push(hodId);
  }

  if (status) {
    sql += " AND r.status = ?";
    params.push(status);
  }
  if (department_id) {
    sql += " AND r.department_id = ?";
    params.push(department_id);
  }
  if (date_from) {
    sql += " AND r.created_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    sql += " AND r.created_at <= ?";
    params.push(date_to);
  }
  if (q) {
    sql += " AND (r.req_no LIKE ? OR r.purpose LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY r.created_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json({ requisitions: rows });
});

router.get("/:id", (req, res) => {
  const full = getFullRequisition(req.params.id);
  if (!full) return res.status(404).json({ error: "Requisition not found." });
  if (req.user.role === "hod" && full.hod_id !== req.user.id) {
    return res.status(403).json({ error: "You may only view your own requisitions." });
  }
  res.json({ requisition: full });
});

// Only HODs can raise a requisition against available inventory.
router.post("/", requireRole("hod"), (req, res) => {
  const { purpose, items, department_id } = req.body || {};
  if (!purpose || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Purpose and at least one requested item are required." });
  }

  const deptId = department_id || req.user.department_id || null;
  const department = deptId ? db.prepare("SELECT * FROM departments WHERE id = ?").get(deptId) : null;
  const departmentName = department ? department.name : (req.user.department || "");

  const resolvedLines = [];
  for (const line of items) {
    if (!line.item_id) {
      return res.status(400).json({ error: "Each line requires a valid item." });
    }
    const item = db.prepare("SELECT * FROM items WHERE id = ? AND is_active = 1").get(line.item_id);
    if (!item) {
      return res.status(400).json({ error: `Item id ${line.item_id} is not a valid, active inventory item.` });
    }

    let baseQty;
    let packagingId = null;
    let packQty = null;
    if (line.packaging_id) {
      const packaging = db
        .prepare("SELECT * FROM item_packagings WHERE id = ? AND item_id = ? AND is_active = 1")
        .get(line.packaging_id, item.id);
      if (!packaging) {
        return res.status(400).json({ error: `Invalid packaging selected for "${item.name}".` });
      }
      const p = Number(line.pack_qty ?? line.qty);
      if (!p || p <= 0) {
        return res.status(400).json({ error: `Enter a quantity greater than zero for "${item.name}".` });
      }
      baseQty = p * packaging.units_per_pack;
      packagingId = packaging.id;
      packQty = p;
    } else {
      baseQty = Number(line.qty);
      if (!baseQty || baseQty <= 0) {
        return res.status(400).json({ error: `Enter a quantity greater than zero for "${item.name}".` });
      }
    }

    if (baseQty > item.quantity_on_hand) {
      return res.status(400).json({
        error: `Requested quantity for "${item.name}" (${baseQty} ${item.unit}) exceeds available stock (${item.quantity_on_hand} ${item.unit}).`,
      });
    }
    resolvedLines.push({ item_id: item.id, baseQty, packagingId, packQty, remarks: line.remarks || "" });
  }

  const reqNo = nextReqNo();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO requisitions(req_no, hod_id, department, department_id, purpose, status, created_at)
         VALUES (?,?,?,?,?,'pending',?)`
      )
      .run(reqNo, req.user.id, departmentName, deptId, purpose, nowIso());
    const reqId = info.lastInsertRowid;
    const insertLine = db.prepare(
      `INSERT INTO requisition_items(requisition_id, item_id, qty_requested, packaging_id, pack_qty, remarks) VALUES (?,?,?,?,?,?)`
    );
    for (const line of resolvedLines) {
      insertLine.run(reqId, line.item_id, line.baseQty, line.packagingId, line.packQty, line.remarks);
    }
    return reqId;
  });
  const reqId = tx();

  audit(req.user.id, req.user.email, "CREATE_REQUISITION", "REQUISITION", reqId, { req_no: reqNo, purpose });
  notifyRoles(["inventoryadmin"], {
    type: "requisition_submitted",
    title: `New requisition ${reqNo}`,
    message: `${req.user.name} (${departmentName}) submitted a new requisition awaiting your approval.`,
    entity_type: "REQUISITION",
    entity_id: reqId,
  });
  res.status(201).json({ requisition: getFullRequisition(reqId) });
});

// Only InventoryAdmin approves requisitions.
router.put("/:id/approve", requireRole("inventoryadmin"), (req, res) => {
  const { id } = req.params;
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.status !== "pending") {
    return res.status(400).json({ error: "Only pending requisitions can be approved." });
  }

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE requisitions SET status='approved', approved_by=?, approved_at=? WHERE id=?"
    ).run(req.user.id, nowIso(), id);
    const insertSignoff = db.prepare(
      "INSERT OR IGNORE INTO signoffs(requisition_id, role_label, signed) VALUES (?,?,0)"
    );
    for (const label of SIGNOFF_ROLES) {
      insertSignoff.run(id, label);
    }
  });
  tx();

  audit(req.user.id, req.user.email, "APPROVE_REQUISITION", "REQUISITION", id, {});
  notifyUser(requisition.hod_id, {
    type: "requisition_approved",
    title: `Requisition ${requisition.req_no} approved`,
    message: "Your requisition was approved. Please sign the Requester clearance line to help move it toward issue.",
    entity_type: "REQUISITION",
    entity_id: id,
  });
  notifyRoles(["technical_expert", "audit_officer", "asset_officer"], {
    type: "signoff_needed",
    title: `Signoff needed: ${requisition.req_no}`,
    message: `Requisition ${requisition.req_no} (${requisition.department}) is awaiting your clearance signature.`,
    entity_type: "REQUISITION",
    entity_id: id,
  });
  res.json({ requisition: getFullRequisition(id) });
});

router.put("/:id/reject", requireRole("inventoryadmin"), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.status !== "pending") {
    return res.status(400).json({ error: "Only pending requisitions can be rejected." });
  }

  db.prepare(
    "UPDATE requisitions SET status='rejected', rejected_by=?, rejected_at=?, rejection_reason=? WHERE id=?"
  ).run(req.user.id, nowIso(), reason || "", id);

  audit(req.user.id, req.user.email, "REJECT_REQUISITION", "REQUISITION", id, { reason });
  notifyUser(requisition.hod_id, {
    type: "requisition_rejected",
    title: `Requisition ${requisition.req_no} rejected`,
    message: reason ? `Reason given: ${reason}` : "No reason was given.",
    entity_type: "REQUISITION",
    entity_id: id,
  });
  res.json({ requisition: getFullRequisition(id) });
});

// Record or withdraw an individual signoff slot on the clearance sheet
// (requester, technical expert, audit officer, asset/insurance officer).
//
// Each party signs for themselves once logged in:
//   - "requester"        -> only the HOD who raised the requisition
//   - "technical_expert" -> only a user with the technical_expert role
//   - "audit_officer"    -> only a user with the audit_officer role
//   - "asset_officer"    -> only a user with the asset_officer role
// superadmin / ictadmin / inventoryadmin may also sign or undo any slot,
// for corrections and to keep the process moving if a signatory is unavailable.
router.put("/:id/signoff", (req, res) => {
  const { id } = req.params;
  const { role_label, signed } = req.body || {};
  if (!SIGNOFF_ROLES.includes(role_label)) {
    return res.status(400).json({ error: "Invalid signoff role." });
  }
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.status !== "approved") {
    return res.status(400).json({ error: "Signoffs can only be recorded on approved requisitions awaiting issue." });
  }

  const isRequesterOwner = role_label === "requester" && requisition.hod_id === req.user.id;
  const isDirectSignatory = req.user.role === role_label;
  const isAdminOverride = ["superadmin", "ictadmin", "inventoryadmin"].includes(req.user.role);

  if (!isRequesterOwner && !isDirectSignatory && !isAdminOverride) {
    return res.status(403).json({ error: "You are not authorized to record this signoff." });
  }

  const signedByName = signed ? req.user.name : null;

  db.prepare(
    `UPDATE signoffs SET signed = ?, signed_by_name = ?, signed_at = ?
     WHERE requisition_id = ? AND role_label = ?`
  ).run(signed ? 1 : 0, signedByName, signed ? nowIso() : null, id, role_label);

  audit(req.user.id, req.user.email, signed ? "SIGN_CLEARANCE" : "UNDO_SIGNOFF", "REQUISITION", id, { role_label });

  if (signed) {
    const signoffs = db.prepare("SELECT * FROM signoffs WHERE requisition_id = ?").all(id);
    const allSigned = SIGNOFF_ROLES.every((label) => {
      const s = signoffs.find((x) => x.role_label === label);
      return s && s.signed;
    });
    if (allSigned) {
      notifyRoles(["inventoryadmin"], {
        type: "ready_to_issue",
        title: `Ready to issue: ${requisition.req_no}`,
        message: "All four clearance signatures are complete. This requisition can now be issued.",
        entity_type: "REQUISITION",
        entity_id: id,
      });
    }
  }
  res.json({ requisition: getFullRequisition(id) });
});

// Issue the requisitioned items: requires status=approved AND all 4 signoffs complete.
// Deducts stock quantities and marks the requisition as issued.
router.put("/:id/issue", requireRole("inventoryadmin"), (req, res) => {
  const { id } = req.params;
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.status !== "approved") {
    return res.status(400).json({ error: "Only approved requisitions can be issued." });
  }

  const signoffs = db.prepare("SELECT * FROM signoffs WHERE requisition_id = ?").all(id);
  const allSigned = SIGNOFF_ROLES.every((label) => {
    const s = signoffs.find((x) => x.role_label === label);
    return s && s.signed;
  });
  if (!allSigned) {
    return res.status(400).json({ error: "All parties (requester, technical expert, audit officer, asset officer) must sign before issue." });
  }

  const lines = db.prepare("SELECT * FROM requisition_items WHERE requisition_id = ?").all(id);
  for (const line of lines) {
    const item = db.prepare("SELECT * FROM items WHERE id = ?").get(line.item_id);
    if (!item || item.quantity_on_hand < line.qty_requested) {
      return res.status(400).json({ error: `Insufficient stock to issue item id ${line.item_id}.` });
    }
  }

  const tx = db.transaction(() => {
    for (const line of lines) {
      db.prepare("UPDATE items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?").run(
        line.qty_requested,
        line.item_id
      );
    }
    db.prepare("UPDATE requisitions SET status='issued', issued_by=?, issued_at=? WHERE id=?").run(
      req.user.id,
      nowIso(),
      id
    );
  });
  tx();

  audit(req.user.id, req.user.email, "ISSUE_REQUISITION", "REQUISITION", id, {});
  notifyUser(requisition.hod_id, {
    type: "requisition_issued",
    title: `Requisition ${requisition.req_no} issued`,
    message: "Your requisitioned item(s) have been issued. You can print a receipt from the requisition page.",
    entity_type: "REQUISITION",
    entity_id: id,
  });
  for (const line of lines) {
    checkLowStockAndNotify(line.item_id);
  }
  res.json({ requisition: getFullRequisition(id) });
});

module.exports = router;
