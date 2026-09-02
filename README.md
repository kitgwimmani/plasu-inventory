# PLASU SMIS — Store Management Information System
Plateau State University, Bokkos

A full-stack rebuild of the original desktop (PyQt5) store requisition system as a
web application: **React + React-Bootstrap** frontend, **Express.js** backend, and a
**SQLite** database, with strict role-based access control.

---

## 1. Roles & Access Control

| Role | Email domain example | Can do |
|---|---|---|
| **Super Admin** (`superadmin`) | superadmin@plasu.edu.ng | Create/manage all user accounts, full oversight of inventory, requisitions and audit log |
| **ICT Admin** (`ictadmin`) | ictadmin@plasu.edu.ng | Same as Super Admin, **plus** the ability to add new inventory items |
| **HOD** (`hod`) | hod.cs@plasu.edu.ng | Raise requisitions against available inventory and track their approval status; signs their own "Requester" clearance line |
| **Inventory Admin** (`inventoryadmin`) | inventoryadmin@plasu.edu.ng | Approve/reject requisitions, issue items once all 4 signoffs are complete (deducts stock), receive incoming stock; may also correct/undo any signoff |
| **Technical Expert** (`technical_expert`) | technical@plasu.edu.ng | Logs in and signs the "Technical Expert" clearance line on approved requisitions |
| **Audit Officer** (`audit_officer`) | audit@plasu.edu.ng | Logs in and signs the "Audit Officer" clearance line on approved requisitions |
| **Asset / Insurance Officer** (`asset_officer`) | asset@plasu.edu.ng | Logs in and signs the "Asset / Insurance Officer" clearance line on approved requisitions |

**Email is the unique login ID for every account.** All access checks are enforced
**server-side** with JWT + per-route role/ownership checks — the frontend hides options a
role shouldn't see, but the API independently rejects any request from an account that
isn't authorized, even if someone bypasses the UI.

### Requisition workflow
1. **HOD** creates a requisition by choosing items from live inventory (cannot request
   more than what's on hand).
2. **Inventory Admin** reviews it and **approves** or **rejects** (with a reason).
3. On approval, a clearance sheet with 4 signoff slots is created:
   *Requester, Technical Expert, Audit Officer, Asset/Insurance Officer.*
4. **Each party signs in with their own account and signs their own line**:
   - The HOD who raised the requisition signs the "Requester" line.
   - The Technical Expert, Audit Officer, and Asset/Insurance Officer each sign their
     own line from their own dashboard/requisition view.
   - A user can only sign the line that matches their role (or their own requisition,
     for the Requester line). Super Admin, ICT Admin, and Inventory Admin can also
     sign or undo any line, to handle corrections or an unavailable signatory.
5. Once **all four** are signed, Inventory Admin can **Issue** the item(s) — this
   deducts the quantities from stock and closes the requisition.

Every sensitive action (login, user creation, item creation, approvals, signoffs,
issues) is written to an **audit log** viewable by Super Admin / ICT Admin.

---

## 2. Project Structure

```
plasu-smis/
├── server/     # Express.js API + SQLite database
└── client/     # React + React-Bootstrap frontend
```

---

## 3. Getting Started

### Prerequisites
- **Node.js 22.5 or newer** and npm (the backend uses Node's built-in `node:sqlite`
  module — check your version with `node -v`; upgrade at https://nodejs.org if needed)
- Internet access on first `npm install` (to download packages)

> The database layer uses Node's **built-in** SQLite module, not a native add-on like
> `better-sqlite3`. That means `npm install` never needs a C++ compiler — no Visual
> Studio Build Tools on Windows, no Xcode Command Line Tools on Mac. You'll see a
> one-line `ExperimentalWarning: SQLite is an experimental feature` message when the
> server starts — that's expected and harmless, not an error.

### Backend

```bash
cd server
cp .env.example .env      # edit JWT_SECRET before going to production
npm install
npm run dev                # starts on http://localhost:5000 (nodemon)
# or: npm start
```

On first run, the SQLite database file `server/db/plasu_smis.sqlite` is created
automatically and seeded with:

- 7 default accounts (one per role) — **password for all: `Passw0rd!`**
  - superadmin@plasu.edu.ng
  - ictadmin@plasu.edu.ng
  - hod.cs@plasu.edu.ng
  - inventoryadmin@plasu.edu.ng
  - technical@plasu.edu.ng
  - audit@plasu.edu.ng
  - asset@plasu.edu.ng
- 4 sample inventory items (A4 paper, pencils, toner, box files)

> If you already have a `plasu_smis.sqlite` file from an earlier version of this app
> (before these 3 signatory roles existed), it will be **migrated automatically** the
> next time the server starts — your existing users, items and requisitions are kept,
> and the 3 new signatory accounts are added for you. No manual steps needed.

> ⚠️ **Change these default passwords immediately** after first login, and set a
> strong, random `JWT_SECRET` in `server/.env` before deploying anywhere real users
> can reach it.

### Frontend

```bash
cd client
npm install
npm start                  # starts on http://localhost:3000
```

The frontend is pre-configured (via `"proxy"` in `client/package.json`) to talk to
the backend at `http://localhost:5000`. To point it elsewhere, set
`REACT_APP_API_URL` in a `client/.env` file.

### Logo & Branding
The university crest (`logo.png`) is already placed in `client/public/logo.png` and
`server/public/logo.png`, and used in the navbar, browser tab icon, and login screen.
The green/gold color scheme is defined in `client/src/styles/theme.css`.

---

## 4. Key API Endpoints

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Any authenticated user |
| GET/POST | `/api/users` | superadmin, ictadmin |
| PUT | `/api/users/:id` | superadmin, ictadmin |
| GET | `/api/items` | Any authenticated user |
| POST | `/api/items` | superadmin, ictadmin |
| POST | `/api/items/:id/receive` | inventoryadmin, superadmin, ictadmin |
| GET/POST | `/api/requisitions` | GET: all roles (HOD sees only their own) · POST: hod |
| PUT | `/api/requisitions/:id/approve` \| `/reject` \| `/issue` | inventoryadmin |
| PUT | `/api/requisitions/:id/signoff` | hod (own requisition, "requester" line only) · technical_expert / audit_officer / asset_officer (their own line only) · superadmin, ictadmin, inventoryadmin (any line, for overrides) |
| GET | `/api/dashboard` | Any authenticated user (role-specific data) |
| GET | `/api/audit` | superadmin, ictadmin |

---

## 5. Deployment (Contabo VPS)

To put this live on the server at `80.241.214.47` (nginx + systemd, auto-deploy
on `git push`), follow **[`deploy/README.md`](deploy/README.md)**. In short:
provision once with `deploy/setup.sh`, then every push to `main` triggers the
GitHub Actions workflow, which runs `deploy/deploy.sh` on the server.

---

## 6. Production Notes
- Swap `JWT_SECRET` for a long random value and store it outside source control.
- Put the app behind HTTPS; set `CLIENT_ORIGIN` in `server/.env` to your real domain for CORS.
- Back up `server/db/plasu_smis.sqlite` regularly, or migrate to a managed Postgres/MySQL
  instance for multi-server deployments (the query layer is centralized in `server/db/init.js`
  and the route files, making a future migration straightforward).
- `node:sqlite` is still an "experimental" Node API. It's stable enough for this app's needs,
  but if you'd rather use a long-established driver, swap `server/db/init.js`'s database
  wrapper for `better-sqlite3` — just be aware that on Windows this requires the "Desktop
  development with C++" workload in Visual Studio Build Tools to compile.
- Consider adding rate limiting on `/api/auth/login` to slow down credential guessing.
