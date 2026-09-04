// routes/categories.js
// Item categories (Stationery, Furniture, ...) and their subcategories.
// Categories are managed by superadmin/ictadmin; the Head of Store may also
// create/manage subcategories. Categories drive the auto-generated item code
// prefix (e.g. "STA-0004"); subcategory codes are namespaced under it ("STA-PEN").
const express = require("express");
const { db, audit, nowIso, nextCategoryCode, nextSubcategoryCode } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const CAN_MANAGE_CATEGORIES = ["superadmin", "ictadmin"];
const CAN_MANAGE_SUBCATEGORIES = ["superadmin", "ictadmin", "head_of_store"];

router.get("/", (req, res) => {
  const { q, include_inactive } = req.query;
  let sql = `
    SELECT c.*,
      (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count,
      (SELECT COUNT(*) FROM subcategories s WHERE s.category_id = c.id AND s.is_active = 1) AS subcategory_count
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

router.post("/", requireRole(...CAN_MANAGE_CATEGORIES), (req, res) => {
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

router.put("/:id", requireRole(...CAN_MANAGE_CATEGORIES), (req, res) => {
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

// ---------------------------------------------------------------------------
// Subcategories
// ---------------------------------------------------------------------------
// Flat list for dropdowns; optional ?category_id= filter.
router.get("/subcategories/all", (req, res) => {
  const { category_id, include_inactive } = req.query;
  let sql = `SELECT s.*, c.name AS category_name, c.code AS category_code
             FROM subcategories s JOIN categories c ON c.id = s.category_id WHERE 1=1`;
  const params = [];
  if (!include_inactive || include_inactive === "0") sql += " AND s.is_active = 1";
  if (category_id) {
    sql += " AND s.category_id = ?";
    params.push(category_id);
  }
  sql += " ORDER BY c.name ASC, s.name ASC";
  res.json({ subcategories: db.prepare(sql).all(...params) });
});

router.get("/:id/subcategories", (req, res) => {
  const { include_inactive } = req.query;
  let sql = `SELECT s.*, (SELECT COUNT(*) FROM items i WHERE i.subcategory_id = s.id) AS item_count
             FROM subcategories s WHERE s.category_id = ?`;
  if (!include_inactive || include_inactive === "0") sql += " AND s.is_active = 1";
  sql += " ORDER BY s.name ASC";
  res.json({ subcategories: db.prepare(sql).all(req.params.id) });
});

router.post("/:id/subcategories", requireRole(...CAN_MANAGE_SUBCATEGORIES), (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body || {};
  const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
  if (!category) return res.status(404).json({ error: "Category not found." });
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Subcategory name is required." });
  }
  const clash = db
    .prepare("SELECT id FROM subcategories WHERE category_id = ? AND name = ?")
    .get(id, name.trim());
  if (clash) return res.status(409).json({ error: "This category already has a subcategory with that name." });

  const code = nextSubcategoryCode(id, name.trim());
  const info = db
    .prepare(
      `INSERT INTO subcategories(category_id, name, code, description, is_active, created_by, created_at)
       VALUES (?,?,?,?,1,?,?)`
    )
    .run(id, name.trim(), code, description || "", req.user.id, nowIso());

  audit(req.user.id, req.user.email, "CREATE_SUBCATEGORY", "SUBCATEGORY", info.lastInsertRowid, {
    name: name.trim(),
    code,
    category: category.name,
  });
  const subcategory = db.prepare("SELECT * FROM subcategories WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ subcategory });
});

router.put("/subcategories/:sid", requireRole(...CAN_MANAGE_SUBCATEGORIES), (req, res) => {
  const { sid } = req.params;
  const { name, description, is_active } = req.body || {};
  const sub = db.prepare("SELECT * FROM subcategories WHERE id = ?").get(sid);
  if (!sub) return res.status(404).json({ error: "Subcategory not found." });

  if (name && name.trim() !== sub.name) {
    const clash = db
      .prepare("SELECT id FROM subcategories WHERE category_id = ? AND name = ? AND id != ?")
      .get(sub.category_id, name.trim(), sid);
    if (clash) return res.status(409).json({ error: "Another subcategory in this category already has that name." });
  }

  db.prepare(
    `UPDATE subcategories SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      is_active = COALESCE(?, is_active),
      updated_at = ?
     WHERE id = ?`
  ).run(name ? name.trim() : null, description ?? null, is_active === undefined ? null : is_active, nowIso(), sid);

  audit(req.user.id, req.user.email, "UPDATE_SUBCATEGORY", "SUBCATEGORY", sid, req.body);
  res.json({ subcategory: db.prepare("SELECT * FROM subcategories WHERE id = ?").get(sid) });
});

module.exports = router;
