// routes/requisitions.js
// Workflow:
//  1. HOD (requester) raises a requisition (status: pending). Each line is either
//     an existing inventory item (with a packaging tier + pack qty) or a brand-new
//     item the requester describes on the spot ("ad-hoc").
//  2. Head of Store reviews and either:
//       - approves it outright (-> approved), or
//       - recommends changes: edits quantities + gives a remark (-> recommended),
//         which the requester then accepts (-> approved), or
//       - rejects it with a remark (-> rejected).
//  3. On approval a 2-slot clearance sheet is created — Head of Store signs first,
//     then the Issuance Officer. Ad-hoc lines become real inventory items (at 0
//     stock) at this point.
//  4. Once both parties have signed, either of them issues the item(s), deducting
//     stock and closing the requisition.
const express = require("express");
const {
  db,
  audit,
  nowIso,
  nextReqNo,
  nextItemCode,
  SIGNOFF_ROLES,
  notifyRoles,
  notifyUser,
  checkLowStockAndNotify,
} = require("../db/init");
const { requireAuth, requireRole, hasRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const ADMIN_OVERRIDE = ["superadmin", "ictadmin"];

function getFullRequisition(id) {
  const reqRow = db.prepare(
    `SELECT r.*, u.name AS hod_name, u.email AS hod_email,
            d.name AS department_name_current,
            ru.name AS recommended_by_name,
            au.name AS approved_by_name, iu.name AS issued_by_name,
            xu.name AS rejected_by_name
     FROM requisitions r
     JOIN users u ON u.id = r.hod_id
     LEFT JOIN departments d ON d.id = r.department_id
     LEFT JOIN users ru ON ru.id = r.recommended_by
     LEFT JOIN users au ON au.id = r.approved_by
     LEFT JOIN users iu ON iu.id = r.issued_by
     LEFT JOIN users xu ON xu.id = r.rejected_by
     WHERE r.id = ?`
  ).get(id);
  if (!reqRow) return null;

  const lines = db.prepare(
    `SELECT ri.*,
            COALESCE(i.code, '—') AS item_code,
            COALESCE(i.name, ri.adhoc_name) AS item_name,
            COALESCE(i.unit, ri.adhoc_unit) AS unit,
            i.quantity_on_hand,
            p.label AS packaging_label, p.units_per_pack,
            ac.name AS adhoc_category_name, asc2.name AS adhoc_subcategory_name,
            ad.name AS adhoc_department_name
     FROM requisition_items ri
     LEFT JOIN items i ON i.id = ri.item_id
     LEFT JOIN item_packagings p ON p.id = ri.packaging_id
     LEFT JOIN categories ac ON ac.id = ri.adhoc_category_id
     LEFT JOIN subcategories asc2 ON asc2.id = ri.adhoc_subcategory_id
     LEFT JOIN departments ad ON ad.id = ri.adhoc_department_id
     WHERE ri.requisition_id = ?
     ORDER BY ri.id`
  ).all(id);

  const signoffs = db.prepare(
    `SELECT role_label, signed, signed_by_name, signed_at FROM signoffs WHERE requisition_id = ?`
  ).all(id);
  // Keep a stable Head-of-Store-first order.
  signoffs.sort((a, b) => SIGNOFF_ROLES.indexOf(a.role_label) - SIGNOFF_ROLES.indexOf(b.role_label));

  return { ...reqRow, lines, signoffs };
}

function allSigned(id) {
  const rows = db.prepare("SELECT role_label, signed FROM signoffs WHERE requisition_id = ?").all(id);
  return SIGNOFF_ROLES.every((label) => {
    const s = rows.find((x) => x.role_label === label);
    return s && s.signed;
  });
}

// Shared post-approval work: build the clearance sheet, materialise any ad-hoc
// lines into real inventory items, and fire the right notifications.
function finalizeApproval(reqId, actorId) {
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(reqId);
  const lines = db.prepare("SELECT * FROM requisition_items WHERE requisition_id = ?").all(reqId);
  const genCat = db.prepare("SELECT id FROM categories WHERE code = 'GEN'").get();

  const tx = db.transaction(() => {
    const insSignoff = db.prepare(
      "INSERT OR IGNORE INTO signoffs(requisition_id, role_label, signed) VALUES (?,?,0)"
    );
    for (const label of SIGNOFF_ROLES) insSignoff.run(reqId, label);

    for (const line of lines) {
      if (!line.is_adhoc || line.item_id) continue;
      const categoryId = line.adhoc_category_id || (genCat ? genCat.id : null);
      const code = nextItemCode(categoryId);
      const unit = line.adhoc_unit || "ea";
      const info = db
        .prepare(
          `INSERT INTO items(code, name, description, unit, quantity_on_hand, reorder_level,
             category_id, subcategory_id, department_id, is_active, created_by, created_at)
           VALUES (?,?,?,?,0,0,?,?,?,1,?,?)`
        )
        .run(
          code,
          line.adhoc_name,
          line.adhoc_description || "",
          unit,
          categoryId,
          line.adhoc_subcategory_id || null,
          line.adhoc_department_id || null,
          actorId,
          nowIso()
        );
      const newItemId = info.lastInsertRowid;
      db.prepare(
        `INSERT INTO item_packagings(item_id, label, units_per_pack, is_default, is_active, created_at)
         VALUES (?,?,1,1,1,?)`
      ).run(newItemId, `Single ${unit}`, nowIso());
      db.prepare("UPDATE requisition_items SET item_id = ? WHERE id = ?").run(newItemId, line.id);
      audit(actorId, null, "CREATE_ITEM", "ITEM", newItemId, {
        code,
        name: line.adhoc_name,
        via: "requisition",
        requisition_id: reqId,
      });
    }
  });
  tx();

  notifyUser(requisition.hod_id, {
    type: "requisition_approved",
    title: `Requisition ${requisition.req_no} approved`,
    message: "Your requisition was approved and now awaits the Head of Store and Issuance Officer signatures.",
    entity_type: "REQUISITION",
    entity_id: reqId,
  });
  notifyRoles(["head_of_store", "issuance_officer"], {
    type: "signoff_needed",
    title: `Signature needed: ${requisition.req_no}`,
    message: `Requisition ${requisition.req_no} (${requisition.department}) is approved and awaiting clearance signatures.`,
    entity_type: "REQUISITION",
    entity_id: reqId,
  });
}

// ---------------------------------------------------------------------------
// List / detail
// ---------------------------------------------------------------------------
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

  // A requester who is *only* an HOD sees their own; anyone with a broader role
  // sees everything.
  if (hasRole(req.user, "hod") && !hasRole(req.user, "superadmin", "ictadmin", "head_of_store", "issuance_officer")) {
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

  res.json({ requisitions: db.prepare(sql).all(...params) });
});

router.get("/:id", (req, res) => {
  const full = getFullRequisition(req.params.id);
  if (!full) return res.status(404).json({ error: "Requisition not found." });
  if (
    hasRole(req.user, "hod") &&
    !hasRole(req.user, "superadmin", "ictadmin", "head_of_store", "issuance_officer") &&
    full.hod_id !== req.user.id
  ) {
    return res.status(403).json({ error: "You may only view your own requisitions." });
  }
  res.json({ requisition: full });
});

// ---------------------------------------------------------------------------
// Create (requester / HOD)
// ---------------------------------------------------------------------------
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
    if (line.is_adhoc) {
      const name = String(line.adhoc_name || "").trim();
      const unit = String(line.adhoc_unit || "").trim();
      const qty = Number(line.qty);
      if (!name || !unit) {
        return res.status(400).json({ error: "A new (ad-hoc) item needs a name and a base unit." });
      }
      if (!qty || qty <= 0) {
        return res.status(400).json({ error: `Enter a quantity greater than zero for "${name}".` });
      }
      if (line.adhoc_category_id) {
        const cat = db.prepare("SELECT id FROM categories WHERE id = ?").get(line.adhoc_category_id);
        if (!cat) return res.status(400).json({ error: "Selected category for the new item was not found." });
      }
      if (line.adhoc_subcategory_id) {
        const sub = db.prepare("SELECT * FROM subcategories WHERE id = ?").get(line.adhoc_subcategory_id);
        if (!sub) return res.status(400).json({ error: "Selected subcategory for the new item was not found." });
        if (line.adhoc_category_id && String(sub.category_id) !== String(line.adhoc_category_id)) {
          return res.status(400).json({ error: "The new item's subcategory does not belong to its category." });
        }
      }
      resolvedLines.push({
        is_adhoc: 1,
        baseQty: qty,
        adhoc: {
          name,
          description: line.adhoc_description || "",
          unit,
          category_id: line.adhoc_category_id || null,
          subcategory_id: line.adhoc_subcategory_id || null,
          department_id: line.adhoc_department_id || null,
        },
        remarks: line.remarks || "",
      });
      continue;
    }

    if (!line.item_id) {
      return res.status(400).json({ error: "Each line requires a valid item or a described new item." });
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
    resolvedLines.push({ is_adhoc: 0, item_id: item.id, baseQty, packagingId, packQty, remarks: line.remarks || "" });
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
      `INSERT INTO requisition_items(requisition_id, item_id, qty_requested, packaging_id, pack_qty, remarks,
         is_adhoc, adhoc_name, adhoc_description, adhoc_unit, adhoc_category_id, adhoc_subcategory_id, adhoc_department_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const line of resolvedLines) {
      insertLine.run(
        reqId,
        line.item_id || null,
        line.baseQty,
        line.packagingId || null,
        line.packQty || null,
        line.remarks,
        line.is_adhoc,
        line.adhoc ? line.adhoc.name : null,
        line.adhoc ? line.adhoc.description : null,
        line.adhoc ? line.adhoc.unit : null,
        line.adhoc ? line.adhoc.category_id : null,
        line.adhoc ? line.adhoc.subcategory_id : null,
        line.adhoc ? line.adhoc.department_id : null
      );
    }
    return reqId;
  });
  const reqId = tx();

  audit(req.user.id, req.user.email, "CREATE_REQUISITION", "REQUISITION", reqId, { req_no: reqNo, purpose });
  notifyRoles(["head_of_store"], {
    type: "requisition_submitted",
    title: `New requisition ${reqNo}`,
    message: `${req.user.name} (${departmentName}) submitted a new requisition awaiting your review.`,
    entity_type: "REQUISITION",
    entity_id: reqId,
  });
  res.status(201).json({ requisition: getFullRequisition(reqId) });
});

// ---------------------------------------------------------------------------
// Head of Store decision: approve / recommend / reject
// ---------------------------------------------------------------------------
router.put("/:id/approve", requireRole("head_of_store"), (req, res) => {
  const { id } = req.params;
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.status !== "pending") {
    return res.status(400).json({ error: "Only pending requisitions can be approved directly." });
  }

  db.prepare("UPDATE requisitions SET status='approved', approved_by=?, approved_at=? WHERE id=?").run(
    req.user.id,
    nowIso(),
    id
  );
  audit(req.user.id, req.user.email, "APPROVE_REQUISITION", "REQUISITION", id, {});
  finalizeApproval(Number(id), req.user.id);
  res.json({ requisition: getFullRequisition(id) });
});

router.put("/:id/recommend", requireRole("head_of_store"), (req, res) => {
  const { id } = req.params;
  const { lines, remark } = req.body || {};
  if (!remark || !String(remark).trim()) {
    return res.status(400).json({ error: "A remark is required when recommending changes." });
  }
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.status !== "pending") {
    return res.status(400).json({ error: "Only pending requisitions can be sent back with a recommendation." });
  }

  const reqLines = db.prepare("SELECT * FROM requisition_items WHERE requisition_id = ?").all(id);
  const byId = new Map(reqLines.map((l) => [l.id, l]));
  const updates = [];
  for (const entry of Array.isArray(lines) ? lines : []) {
    const line = byId.get(Number(entry.line_id));
    if (!line) return res.status(400).json({ error: "A recommended line does not belong to this requisition." });
    const qty = Number(entry.qty_recommended);
    if (!(qty > 0)) return res.status(400).json({ error: "Recommended quantities must be greater than zero." });
    updates.push({ line, qty });
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: "Adjust at least one line quantity, or use Approve / Reject instead." });
  }

  const tx = db.transaction(() => {
    const upd = db.prepare("UPDATE requisition_items SET qty_recommended = ? WHERE id = ?");
    for (const u of updates) upd.run(u.qty, u.line.id);
    db.prepare(
      "UPDATE requisitions SET status='recommended', recommended_by=?, recommended_at=?, recommendation_remark=? WHERE id=?"
    ).run(req.user.id, nowIso(), String(remark).trim(), id);
  });
  tx();

  audit(req.user.id, req.user.email, "RECOMMEND_REQUISITION", "REQUISITION", id, { remark, lines: updates.length });
  notifyUser(requisition.hod_id, {
    type: "requisition_recommended",
    title: `Requisition ${requisition.req_no}: changes recommended`,
    message: `The Head of Store recommended changes. Review and accept to approve. Remark: ${String(remark).trim()}`,
    entity_type: "REQUISITION",
    entity_id: id,
  });
  res.json({ requisition: getFullRequisition(id) });
});

router.put("/:id/reject", requireRole("head_of_store"), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: "A remark/reason is required to reject a requisition." });
  }
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (!["pending", "recommended"].includes(requisition.status)) {
    return res.status(400).json({ error: "Only pending or recommended requisitions can be rejected." });
  }

  db.prepare(
    "UPDATE requisitions SET status='rejected', rejected_by=?, rejected_at=?, rejection_reason=? WHERE id=?"
  ).run(req.user.id, nowIso(), String(reason).trim(), id);

  audit(req.user.id, req.user.email, "REJECT_REQUISITION", "REQUISITION", id, { reason });
  notifyUser(requisition.hod_id, {
    type: "requisition_rejected",
    title: `Requisition ${requisition.req_no} rejected`,
    message: `Reason given: ${String(reason).trim()}`,
    entity_type: "REQUISITION",
    entity_id: id,
  });
  res.json({ requisition: getFullRequisition(id) });
});

// Requester accepts the Head of Store's recommendation — this IS the approval.
router.put("/:id/accept", (req, res) => {
  const { id } = req.params;
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.hod_id !== req.user.id) {
    return res.status(403).json({ error: "Only the requester can accept a recommendation." });
  }
  if (requisition.status !== "recommended") {
    return res.status(400).json({ error: "There is no recommendation awaiting your acceptance." });
  }

  const tx = db.transaction(() => {
    const lines = db.prepare("SELECT * FROM requisition_items WHERE requisition_id = ?").all(id);
    for (const line of lines) {
      if (line.qty_recommended == null) continue;
      let packQty = line.pack_qty;
      if (line.packaging_id) {
        const pkg = db.prepare("SELECT units_per_pack FROM item_packagings WHERE id = ?").get(line.packaging_id);
        packQty = pkg && pkg.units_per_pack ? line.qty_recommended / pkg.units_per_pack : null;
      }
      db.prepare("UPDATE requisition_items SET qty_requested = ?, pack_qty = ? WHERE id = ?").run(
        line.qty_recommended,
        packQty,
        line.id
      );
    }
    db.prepare(
      "UPDATE requisitions SET status='approved', approved_by=?, approved_at=?, accepted_at=? WHERE id=?"
    ).run(req.user.id, nowIso(), nowIso(), id);
  });
  tx();

  audit(req.user.id, req.user.email, "ACCEPT_RECOMMENDATION", "REQUISITION", id, {});
  finalizeApproval(Number(id), req.user.id);
  res.json({ requisition: getFullRequisition(id) });
});

// ---------------------------------------------------------------------------
// Clearance signatures (Head of Store, then Issuance Officer)
// ---------------------------------------------------------------------------
router.put("/:id/signoff", (req, res) => {
  const { id } = req.params;
  const { role_label, signed } = req.body || {};
  if (!SIGNOFF_ROLES.includes(role_label)) {
    return res.status(400).json({ error: "Invalid signoff role." });
  }
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.status !== "approved") {
    return res.status(400).json({ error: "Signatures can only be recorded on approved requisitions awaiting issue." });
  }

  const canSign = hasRole(req.user, role_label) || hasRole(req.user, ...ADMIN_OVERRIDE);
  if (!canSign) {
    return res.status(403).json({ error: "You are not authorized to record this signature." });
  }

  const rows = db.prepare("SELECT * FROM signoffs WHERE requisition_id = ?").all(id);
  const hosSigned = rows.find((r) => r.role_label === "head_of_store")?.signed;

  if (role_label === "issuance_officer" && signed && !hosSigned) {
    return res.status(400).json({ error: "The Head of Store must sign before the Issuance Officer." });
  }
  if (role_label === "head_of_store" && !signed) {
    const ioSigned = rows.find((r) => r.role_label === "issuance_officer")?.signed;
    if (ioSigned) {
      return res.status(400).json({ error: "Undo the Issuance Officer signature first." });
    }
  }

  db.prepare(
    `UPDATE signoffs SET signed = ?, signed_by_name = ?, signed_at = ?
     WHERE requisition_id = ? AND role_label = ?`
  ).run(signed ? 1 : 0, signed ? req.user.name : null, signed ? nowIso() : null, id, role_label);

  audit(req.user.id, req.user.email, signed ? "SIGN_CLEARANCE" : "UNDO_SIGNOFF", "REQUISITION", id, { role_label });

  if (signed && allSigned(id)) {
    notifyRoles(["head_of_store", "issuance_officer"], {
      type: "ready_to_issue",
      title: `Ready to issue: ${requisition.req_no}`,
      message: "Both clearance signatures are complete. This requisition can now be issued.",
      entity_type: "REQUISITION",
      entity_id: id,
    });
  }
  res.json({ requisition: getFullRequisition(id) });
});

// ---------------------------------------------------------------------------
// Issue (either Head of Store or Issuance Officer)
// ---------------------------------------------------------------------------
router.put("/:id/issue", requireRole("head_of_store", "issuance_officer", ...ADMIN_OVERRIDE), (req, res) => {
  const { id } = req.params;
  const requisition = db.prepare("SELECT * FROM requisitions WHERE id = ?").get(id);
  if (!requisition) return res.status(404).json({ error: "Requisition not found." });
  if (requisition.status !== "approved") {
    return res.status(400).json({ error: "Only approved requisitions can be issued." });
  }
  if (!allSigned(id)) {
    return res.status(400).json({ error: "Both the Head of Store and Issuance Officer must sign before issue." });
  }

  const lines = db.prepare("SELECT * FROM requisition_items WHERE requisition_id = ?").all(id);
  for (const line of lines) {
    const item = line.item_id ? db.prepare("SELECT * FROM items WHERE id = ?").get(line.item_id) : null;
    if (!item) {
      return res.status(400).json({ error: `A requested item is missing from inventory and cannot be issued.` });
    }
    if (item.quantity_on_hand < line.qty_requested) {
      return res.status(400).json({
        error: `Not enough stock of "${item.name}" (${item.quantity_on_hand} ${item.unit} on hand, ${line.qty_requested} needed). Receive stock first.`,
      });
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
    if (line.item_id) checkLowStockAndNotify(line.item_id);
  }
  res.json({ requisition: getFullRequisition(id) });
});

module.exports = router;
