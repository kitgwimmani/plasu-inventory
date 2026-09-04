// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

require("./db/init"); // ensures schema + seed run on boot

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const itemRoutes = require("./routes/items");
const requisitionRoutes = require("./routes/requisitions");
const dashboardRoutes = require("./routes/dashboard");
const auditRoutes = require("./routes/audit");
const departmentRoutes = require("./routes/departments");
const categoryRoutes = require("./routes/categories");
const notificationRoutes = require("./routes/notifications");
const reportRoutes = require("./routes/reports");
const clearanceRoutes = require("./routes/clearance");
const backupRoutes = require("./routes/backup");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    exposedHeaders: ["Content-Disposition"],
  })
);
app.use(express.json());
app.use(morgan("dev"));
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => res.json({ ok: true, name: "PLASU-SMIS API" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/requisitions", requisitionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/clearance", clearanceRoutes);
app.use("/api/backup", backupRoutes);

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(PORT, () => {
  console.log(`PLASU SMIS API listening on http://localhost:${PORT}`);
});
