// routes/categories.js
// Item categories (Stationery, Furniture, Electronics & IT, ...) are managed
// exclusively by admins and used both to organize/filter inventory and to build
// the auto-generated item code prefix (e.g. "STA-0004").
const express = require("express");
const { db, audit, nowIso, nextCategoryCode } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const CAN_MANAGE = ["superadmin", "ictadmin"];

router.get("/", (req, res) => {
  const { q, include_inactive } = req.query;
  let sql = `
    SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count
    FROM categories c WHERE 1=1`;
  const params = [];
  if (!include_inactive || include_inactive === "0") sql += " AND c.is_active = 1";
  if (q) {
    sql += " AND (c.name LIKE ? OR c.code LIKE ? OR c.description LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY c.name ASC";
  const categories = db.prepare(sql).all(...params);
  res.json({ categories });
});

router.post("/", requireRole(...CAN_MANAGE), (req, res) => {
  const { name, description } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Category name is required." });
  }
  const existing = db.prepare("SELECT id FROM categories WHERE name = ?").get(name.trim());
  if (existing) {
    return res.status(409).json({ error: "A category with this name already exists." });
  }
  const code = nextCategoryCode(name.trim());
  const info = db
    .prepare(`INSERT INTO categories(name, code, description, is_active, created_by, created_at) VALUES (?,?,?,1,?,?)`)
    .run(name.trim(), code, description || "", req.user.id, nowIso());

  audit(req.user.id, req.user.email, "CREATE_CATEGORY", "CATEGORY", info.lastInsertRowid, { name, code });
  const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ category });
});

router.put("/:id", requireRole(...CAN_MANAGE), (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body || {};
  const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
  if (!category) return res.status(404).json({ error: "Category not found." });

  if (name && name.trim() !== category.name) {
    const clash = db.prepare("SELECT id FROM categories WHERE name = ? AND id != ?").get(name.trim(), id);
    if (clash) return res.status(409).json({ error: "Another category already has this name." });
  }

  db.prepare(
    `UPDATE categories SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      is_active = COALESCE(?, is_active),
      updated_at = ?
     WHERE id = ?`
  ).run(name ? name.trim() : null, description ?? null, is_active === undefined ? null : is_active, nowIso(), id);

  audit(req.user.id, req.user.email, "UPDATE_CATEGORY", "CATEGORY", id, req.body);
  const updated = db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
  res.json({ category: updated });
});

module.exports = router;
