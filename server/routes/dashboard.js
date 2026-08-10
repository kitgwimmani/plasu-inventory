// routes/dashboard.js
// Provides a role-tailored "mini dashboard" summary for each account type.
const express = require("express");
const { db } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const role = req.user.role;
  const stats = {};

  if (role === "superadmin" || role === "ictadmin") {
    stats.totalUsers = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
    stats.activeUsers = db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_active=1").get().c;
    stats.totalItems = db.prepare("SELECT COUNT(*) AS c FROM items WHERE is_active=1").get().c;
    stats.lowStockItems = db
      .prepare("SELECT COUNT(*) AS c FROM items WHERE is_active=1 AND quantity_on_hand <= reorder_level")
      .get().c;
    stats.pendingRequisitions = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='pending'").get().c;
    stats.approvedRequisitions = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='approved'").get().c;
    stats.issuedRequisitions = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='issued'").get().c;
    stats.rejectedRequisitions = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='rejected'").get().c;
    stats.usersByRole = db.prepare("SELECT role, COUNT(*) AS c FROM users GROUP BY role").all();
    stats.recentActivity = db
      .prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 15")
      .all();
  }

  if (role === "hod") {
    stats.myTotal = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE hod_id=?").get(req.user.id).c;
    stats.myPending = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE hod_id=? AND status='pending'")
      .get(req.user.id).c;
    stats.myApproved = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE hod_id=? AND status='approved'")
      .get(req.user.id).c;
    stats.myIssued = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE hod_id=? AND status='issued'")
      .get(req.user.id).c;
    stats.myRejected = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE hod_id=? AND status='rejected'")
      .get(req.user.id).c;
    stats.recentRequisitions = db
      .prepare("SELECT * FROM requisitions WHERE hod_id=? ORDER BY created_at DESC LIMIT 10")
      .all(req.user.id);
  }

  if (role === "inventoryadmin") {
    stats.pendingApproval = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='pending'").get().c;
    stats.awaitingIssue = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='approved'").get().c;
    stats.issuedThisYear = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='issued' AND strftime('%Y', issued_at) = strftime('%Y','now')")
      .get().c;
    stats.totalItems = db.prepare("SELECT COUNT(*) AS c FROM items WHERE is_active=1").get().c;
    stats.lowStockItems = db
      .prepare("SELECT * FROM items WHERE is_active=1 AND quantity_on_hand <= reorder_level ORDER BY quantity_on_hand ASC")
      .all();
    stats.pendingList = db
      .prepare("SELECT * FROM requisitions WHERE status='pending' ORDER BY created_at ASC LIMIT 10")
      .all();
    stats.awaitingIssueList = db
      .prepare("SELECT * FROM requisitions WHERE status='approved' ORDER BY approved_at ASC LIMIT 10")
      .all();
  }

  if (["technical_expert", "audit_officer", "asset_officer"].includes(role)) {
    stats.awaitingMySignoff = db
      .prepare(
        `SELECT r.* FROM requisitions r
         JOIN signoffs s ON s.requisition_id = r.id
         WHERE r.status='approved' AND s.role_label = ? AND s.signed = 0
         ORDER BY r.approved_at ASC`
      )
      .all(role);
    stats.signedByMeCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM signoffs WHERE role_label = ? AND signed = 1`
      )
      .get(role).c;
    stats.awaitingMySignoffCount = stats.awaitingMySignoff.length;
  }

  res.json({ role, stats });
});

module.exports = router;
