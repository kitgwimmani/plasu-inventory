// routes/dashboard.js
// Provides a role-tailored "mini dashboard" summary for each account type.
// A user's PRIMARY role (users.role, derived from ROLE_PRIORITY) decides which
// summary they get; multi-role users can still act elsewhere in the app.
const express = require("express");
const { db } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

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
    stats.recommendedRequisitions = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='recommended'").get().c;
    stats.approvedRequisitions = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='approved'").get().c;
    stats.issuedRequisitions = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='issued'").get().c;
    stats.rejectedRequisitions = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='rejected'").get().c;
    stats.pendingClearance = db.prepare("SELECT COUNT(*) AS c FROM clearance_requests WHERE status='pending'").get().c;
    stats.usersByRole = db
      .prepare("SELECT role, COUNT(*) AS c FROM user_roles GROUP BY role")
      .all();
    stats.recentActivity = db
      .prepare(
        `SELECT a.*, u.name AS actor_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
         ORDER BY a.id DESC LIMIT 15`
      )
      .all();
  }

  if (role === "hod") {
    stats.myTotal = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE hod_id=?").get(req.user.id).c;
    stats.myPending = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE hod_id=? AND status='pending'")
      .get(req.user.id).c;
    stats.myRecommended = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE hod_id=? AND status='recommended'")
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

  if (role === "head_of_store") {
    stats.pendingApproval = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='pending'").get().c;
    stats.awaitingRequesterAccept = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='recommended'").get().c;
    stats.awaitingIssue = db.prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='approved'").get().c;
    stats.issuedThisYear = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='issued' AND strftime('%Y', issued_at) = strftime('%Y','now')")
      .get().c;
    stats.pendingClearance = db.prepare("SELECT COUNT(*) AS c FROM clearance_requests WHERE status='pending'").get().c;
    stats.unclearedReceipts = db.prepare("SELECT COUNT(*) AS c FROM stock_receipts WHERE clearance_request_id IS NULL").get().c;
    stats.totalItems = db.prepare("SELECT COUNT(*) AS c FROM items WHERE is_active=1").get().c;
    stats.lowStockItems = db
      .prepare("SELECT * FROM items WHERE is_active=1 AND quantity_on_hand <= reorder_level ORDER BY quantity_on_hand ASC")
      .all();
    stats.pendingList = db
      .prepare("SELECT * FROM requisitions WHERE status IN ('pending','recommended') ORDER BY created_at ASC LIMIT 10")
      .all();
    stats.awaitingIssueList = db
      .prepare("SELECT * FROM requisitions WHERE status='approved' ORDER BY approved_at ASC LIMIT 10")
      .all();
  }

  if (role === "issuance_officer") {
    stats.awaitingMySignature = db
      .prepare(
        `SELECT r.* FROM requisitions r
         JOIN signoffs h ON h.requisition_id = r.id AND h.role_label='head_of_store' AND h.signed=1
         JOIN signoffs io ON io.requisition_id = r.id AND io.role_label='issuance_officer' AND io.signed=0
         WHERE r.status='approved' ORDER BY r.approved_at ASC`
      )
      .all();
    stats.awaitingMySignatureCount = stats.awaitingMySignature.length;
    stats.awaitingIssue = db
      .prepare(
        `SELECT COUNT(*) AS c FROM requisitions r
         WHERE r.status='approved'
           AND (SELECT COUNT(*) FROM signoffs s WHERE s.requisition_id=r.id AND s.signed=1) = 2`
      )
      .get().c;
    stats.issuedThisYear = db
      .prepare("SELECT COUNT(*) AS c FROM requisitions WHERE status='issued' AND strftime('%Y', issued_at) = strftime('%Y','now')")
      .get().c;
  }

  if (["technical_expert", "audit_officer", "asset_officer"].includes(role)) {
    stats.awaitingMyClearanceSignoff = db
      .prepare(
        `SELECT c.*, u.name AS created_by_name,
           (SELECT COUNT(*) FROM stock_receipts sr WHERE sr.clearance_request_id = c.id) AS receipt_count
         FROM clearance_requests c
         JOIN clearance_signoffs s ON s.clearance_request_id = c.id
         JOIN users u ON u.id = c.created_by
         WHERE c.status='pending' AND s.role_label = ? AND s.signed = 0
         ORDER BY c.created_at ASC`
      )
      .all(role);
    stats.awaitingMyClearanceSignoffCount = stats.awaitingMyClearanceSignoff.length;
    stats.clearedByMeCount = db
      .prepare("SELECT COUNT(*) AS c FROM clearance_signoffs WHERE role_label = ? AND signed = 1")
      .get(role).c;
  }

  res.json({ role, stats });
});

module.exports = router;
