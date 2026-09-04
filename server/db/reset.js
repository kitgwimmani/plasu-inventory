// db/reset.js
// Wipes ALL data from the database and re-seeds the default accounts, categories,
// departments and sample items — for starting fresh before real data entry.
//
//   node db/reset.js            (asks for confirmation)
//   node db/reset.js --yes      (no prompt — for scripts)
//
// The schema/migrations in init.js run first (require below), then every table
// is emptied and the seed is re-applied. Default password for all seeded
// accounts: Passw0rd!
const readline = require("readline");
const { db, seedIfEmpty, backfillUserRoles } = require("./init");

// Child-before-parent so foreign keys stay satisfied (we also disable FKs to be safe).
const TABLES = [
  "clearance_signoffs",
  "clearance_requests",
  "signoffs",
  "requisition_items",
  "requisitions",
  "stock_receipts",
  "item_packagings",
  "items",
  "subcategories",
  "categories",
  "notifications",
  "audit_logs",
  "user_roles",
  "users",
  "departments",
];

function wipeAndSeed() {
  db.exec("PRAGMA foreign_keys=OFF");
  const tx = db.transaction(() => {
    for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
    db.exec("DELETE FROM sqlite_sequence");
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON");

  // seedIfEmpty() re-creates the 8 default users, categories, departments and
  // sample items now that every table is empty; backfillUserRoles() fills the
  // user_roles table from each seeded user's primary role.
  seedIfEmpty();
  backfillUserRoles();

  const counts = {
    users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
    departments: db.prepare("SELECT COUNT(*) AS c FROM departments").get().c,
    categories: db.prepare("SELECT COUNT(*) AS c FROM categories").get().c,
    items: db.prepare("SELECT COUNT(*) AS c FROM items").get().c,
  };
  console.log("Database reset complete:", counts);
  console.log("All seeded accounts use password: Passw0rd!");
}

if (process.argv.includes("--yes") || process.argv.includes("-y")) {
  wipeAndSeed();
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(
    'This DELETES ALL DATA (users, requisitions, inventory, clearances, audit log).\nType "RESET" to continue: ',
    (answer) => {
      rl.close();
      if (answer.trim() === "RESET") {
        wipeAndSeed();
      } else {
        console.log("Aborted — nothing changed.");
        process.exit(1);
      }
    }
  );
}
