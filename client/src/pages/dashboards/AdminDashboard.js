import React, { useEffect, useState } from "react";
import { Row, Card, Table, Badge, Alert, Spinner } from "react-bootstrap";
import api from "../../api/axios";
import StatCard from "../../components/StatCard";
import { useAuth, ROLE_LABELS } from "../../context/AuthContext";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard")
      .then((res) => setStats(res.data.stats))
      .catch((err) => setError(err?.response?.data?.error || "Could not load dashboard."));
  }, []);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!stats) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" style={{ color: "#0f6b2c" }} />
      </div>
    );
  }

  return (
    <>
      <h4 className="mb-1">
        {user.role === "superadmin" ? "Super Admin" : "ICT Admin"} Dashboard
      </h4>
      <p className="text-muted">
        Full system oversight: manage users{user.role === "ictadmin" ? ", manage inventory items" : ""} and monitor store activity.
      </p>

      <Row>
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Active Users" value={stats.activeUsers} />
        <StatCard label="Inventory Items" value={stats.totalItems} />
        <StatCard label="Low Stock Items" value={stats.lowStockItems} warn={stats.lowStockItems > 0} />
      </Row>
      <Row>
        <StatCard label="Pending Requisitions" value={stats.pendingRequisitions} />
        <StatCard label="Approved (Awaiting Issue)" value={stats.approvedRequisitions} />
        <StatCard label="Issued Requisitions" value={stats.issuedRequisitions} />
        <StatCard label="Rejected Requisitions" value={stats.rejectedRequisitions} />
      </Row>

      <Row>
        <Card className="plasu-card m-2 p-3" style={{ flex: 1 }}>
          <h6>Users by Role</h6>
          <Table size="sm" borderless className="mb-0">
            <tbody>
              {stats.usersByRole.map((r) => (
                <tr key={r.role}>
                  <td>{ROLE_LABELS[r.role] || r.role}</td>
                  <td className="text-end fw-bold">{r.c}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Row>

      <Card className="plasu-card p-3 mt-2">
        <h6>Recent Activity</h6>
        <Table responsive hover size="sm" className="table-plasu mb-0">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentActivity.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString()}</td>
                <td>{log.actor_email || "—"}</td>
                <td><Badge bg="secondary">{log.action}</Badge></td>
                <td>{log.entity_type} #{log.entity_id}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
