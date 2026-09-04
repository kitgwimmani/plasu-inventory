// routes/clearance.js
// Stock-receipt clearance. The Head of Store selects a date range; every stock
// receipt recorded in that window that has not already been cleared is bundled
// into one Clearance Request. The Technical Expert, Audit Officer and Asset &
// Insurance Officer each sign it; once all three have signed the request is
// "cleared" and its receipts are considered audited. Signing these off is the
// only workflow action those three roles perform.
const express = require("express");
const {
  db,
  audit,
  nowIso,
  nextClearanceRef,
  CLEARANCE_ROLES,
  notifyRoles,
  notifyUser,
} = require("../db/init");
const { requireAuth, requireRole, hasRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const CAN_CREATE = ["head_of_store", "superadmin", "ictadmin"];
const ADMIN_OVERRIDE = ["superadmin", "ictadmin"];

// Normalise a yyyy-mm-dd (or ISO) bound to an inclusive ISO range.
function rangeBounds(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  // Treat `to` as the end of that day.
  end.setHours(23, 59, 59, 999);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function receiptQuery(extraWhere = "") {
  return `
    SELECT sr.*, i.code AS item_code, i.name AS item_name, i.unit,
           p.label AS packaging_label, p.units_per_pack,
           u.name AS received_by_name
    FROM stock_receipts sr
    JOIN items i ON i.id = sr.item_id
    LEFT JOIN item_packagings p ON p.id = sr.packaging_id
    LEFT JOIN users u ON u.id = sr.received_by
    ${extraWhere}
    ORDER BY sr.created_at ASC`;
}

function getFullClearance(id) {
  const cr = db
    .prepare(
      `SELECT c.*, u.name AS created_by_name
       FROM clearance_requests c JOIN users u ON u.id = c.created_by WHERE c.id = ?`
    )
    .get(id);
  if (!cr) return null;
  const receipts = db.prepare(receiptQuery("WHERE sr.clearance_request_id = ?")).all(id);
  const signoffs = db
    .prepare("SELECT role_label, signed, signed_by_name, signed_at, remark FROM clearance_signoffs WHERE clearance_request_id = ?")
    .all(id);
  signoffs.sort((a, b) => CLEARANCE_ROLES.indexOf(a.role_label) - CLEARANCE_ROLES.indexOf(b.role_label));
  const totalQty = receipts.reduce((s, r) => s + Number(r.qty || 0), 0);
  return { ...cr, receipts, signoffs, receipt_count: receipts.length, total_qty: totalQty };
}

// Preview: uncleared receipts within a range (for building a new request).
router.get("/receipts", requireRole(...CAN_CREATE), (req, res) => {
  const { date_from, date_to } = req.query;
  if (!date_from || !date_to) {
    return res.status(400).json({ error: "A date range (date_from and date_to) is required." });
  }
  const bounds = rangeBounds(date_from, date_to);
  if (!bounds) return res.status(400).json({ error: "Invalid date range." });
  const receipts = db
    .prepare(receiptQuery("WHERE sr.clearance_request_id IS NULL AND sr.created_at >= ? AND sr.created_at <= ?"))
    .all(bounds.fromIso, bounds.toIso);
  res.json({ receipts });
});

router.get("/", (req, res) => {
  const { status } = req.query;
  const isOfficer = hasRole(req.user, ...CLEARANCE_ROLES);
  const isManager = hasRole(req.user, ...CAN_CREATE);

  let sql = `
    SELECT c.*, u.name AS created_by_name,
      (SELECT COUNT(*) FROM stock_receipts sr WHERE sr.clearance_request_id = c.id) AS receipt_count,
      (SELECT COUNT(*) FROM clearance_signoffs s WHERE s.clearance_request_id = c.id AND s.signed = 1) AS signed_count
    FROM clearance_requests c
    JOIN users u ON u.id = c.created_by
    WHERE 1=1`;
  const params = [];
  if (status) {
    sql += " AND c.status = ?";
    params.push(status);
  }
  // Officers who aren't also managers only need to see the ones they act on.
  if (isOfficer && !isManager) {
    sql += ` AND EXISTS (SELECT 1 FROM clearance_signoffs s
             WHERE s.clearance_request_id = c.id AND s.role_label IN (${CLEARANCE_ROLES.map(() => "?").join(",")}))`;
    params.push(...req.user.roles.filter((r) => CLEARANCE_ROLES.includes(r)));
  }
  sql += " ORDER BY c.created_at DESC";
  res.json({ clearance_requests: db.prepare(sql).all(...params) });
});

router.get("/:id", (req, res) => {
  const full = getFullClearance(req.params.id);
  if (!full) return res.status(404).json({ error: "Clearance request not found." });
  res.json({ clearance_request: full });
});

router.post("/", requireRole(...CAN_CREATE), (req, res) => {
  const { date_from, date_to, remark } = req.body || {};
  if (!date_from || !date_to) {
    return res.status(400).json({ error: "A date range is required." });
  }
  const bounds = rangeBounds(date_from, date_to);
  if (!bounds) return res.status(400).json({ error: "Invalid date range." });

  const receipts = db
    .prepare("SELECT id FROM stock_receipts WHERE clearance_request_id IS NULL AND created_at >= ? AND created_at <= ?")
    .all(bounds.fromIso, bounds.toIso);
  if (receipts.length === 0) {
    return res.status(400).json({ error: "No uncleared stock receipts were recorded in that date range." });
  }

  const refNo = nextClearanceRef();
  const crId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO clearance_requests(ref_no, date_from, date_to, status, remark, created_by, created_at)
         VALUES (?,?,?,'pending',?,?,?)`
      )
      .run(refNo, bounds.fromIso, bounds.toIso, remark || "", req.user.id, nowIso());
    const id = info.lastInsertRowid;
    const link = db.prepare("UPDATE stock_receipts SET clearance_request_id = ? WHERE id = ?");
    for (const r of receipts) link.run(id, r.id);
    const insSign = db.prepare(
      "INSERT INTO clearance_signoffs(clearance_request_id, role_label, signed) VALUES (?,?,0)"
    );
    for (const label of CLEARANCE_ROLES) insSign.run(id, label);
    return id;
  })();

  audit(req.user.id, req.user.email, "CREATE_CLEARANCE_REQUEST", "CLEARANCE_REQUEST", crId, {
    ref_no: refNo,
    receipts: receipts.length,
  });
  notifyRoles(CLEARANCE_ROLES, {
    type: "clearance_signoff_needed",
    title: `Clearance ${refNo} awaiting your signature`,
    message: `${receipts.length} stock receipt(s) submitted for audit clearance.`,
    entity_type: "CLEARANCE_REQUEST",
    entity_id: crId,
  });
  res.status(201).json({ clearance_request: getFullClearance(crId) });
});

router.put("/:id/signoff", requireRole(...CLEARANCE_ROLES, ...ADMIN_OVERRIDE), (req, res) => {
  const { id } = req.params;
  const { role_label, signed, remark } = req.body || {};
  if (!CLEARANCE_ROLES.includes(role_label)) {
    return res.status(400).json({ error: "Invalid clearance signoff role." });
  }
  const cr = db.prepare("SELECT * FROM clearance_requests WHERE id = ?").get(id);
  if (!cr) return res.status(404).json({ error: "Clearance request not found." });
  if (cr.status !== "pending") {
    return res.status(400).json({ error: "This clearance request is already cleared." });
  }

  const canSign = hasRole(req.user, role_label) || hasRole(req.user, ...ADMIN_OVERRIDE);
  if (!canSign) {
    return res.status(403).json({ error: "You are not authorized to record this signature." });
  }

  db.prepare(
    `UPDATE clearance_signoffs SET signed = ?, signed_by_name = ?, signed_at = ?, remark = ?
     WHERE clearance_request_id = ? AND role_label = ?`
  ).run(signed ? 1 : 0, signed ? req.user.name : null, signed ? nowIso() : null, remark || null, id, role_label);

  audit(req.user.id, req.user.email, signed ? "SIGN_CLEARANCE_REQUEST" : "UNDO_CLEARANCE_SIGNOFF", "CLEARANCE_REQUEST", id, {
    role_label,
  });

  const rows = db.prepare("SELECT role_label, signed FROM clearance_signoffs WHERE clearance_request_id = ?").all(id);
  const done = CLEARANCE_ROLES.every((l) => rows.find((r) => r.role_label === l)?.signed);
  if (done) {
    db.prepare("UPDATE clearance_requests SET status='cleared', cleared_at=? WHERE id=?").run(nowIso(), id);
    audit(req.user.id, req.user.email, "CLEARANCE_REQUEST_CLEARED", "CLEARANCE_REQUEST", id, {});
    notifyUser(cr.created_by, {
      type: "clearance_cleared",
      title: `Clearance ${cr.ref_no} fully signed`,
      message: "All three officers have signed. The stock receipts are cleared.",
      entity_type: "CLEARANCE_REQUEST",
      entity_id: id,
    });
  }
  res.json({ clearance_request: getFullClearance(id) });
});

module.exports = router;
