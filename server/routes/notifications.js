// routes/notifications.js
// Bell-icon notifications: every user only ever sees their own. Notifications are
// generated server-side (see db/init.js notifyUsers/notifyRoles) whenever something
// they care about happens — a new requisition to review, a signoff needed, an
// approval/rejection/issue on their own requisition, or a low-stock alert.
const express = require("express");
const { db, nowIso } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const notifications = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(req.user.id, limit);
  const unread = db
    .prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0")
    .get(req.user.id).c;
  res.json({ notifications, unread });
});

router.put("/:id/read", (req, res) => {
  const { id } = req.params;
  const notif = db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!notif) return res.status(404).json({ error: "Notification not found." });
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
  res.json({ ok: true });
});

router.put("/read-all", (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0").run(req.user.id);
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const notif = db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!notif) return res.status(404).json({ error: "Notification not found." });
  db.prepare("DELETE FROM notifications WHERE id = ?").run(id);
  res.json({ ok: true });
});

module.exports = router;
