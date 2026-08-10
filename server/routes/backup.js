// routes/backup.js
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { db } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", requireRole("superadmin", "ictadmin"), (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `plasu_smis_backup_${stamp}.sqlite`;
  const tmpPath = path.join(os.tmpdir(), filename);

  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    // VACUUM INTO writes a consistent, defragmented snapshot of the live DB —
    // safe to run while the server keeps handling requests.
    db.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not create database backup." });
  }

  res.download(tmpPath, filename, (err) => {
    fs.unlink(tmpPath, () => {});
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Could not download backup file." });
    }
  });
});

module.exports = router;
