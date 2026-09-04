// routes/audit.js
const express = require("express");
const { db } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", requireRole("superadmin", "ictadmin"), (req, res) => {
  const logs = db
    .prepare(
      `SELECT a.*, u.name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.id DESC LIMIT 300`
    )
    .all();
  res.json({ logs });
});

module.exports = router;
