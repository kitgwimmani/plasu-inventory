import React, { useEffect, useState } from "react";
import { Row, Card, Table, Alert, Spinner, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { formatDate } from "../../utils/formatDate";

export default function HodDashboard() {
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
      <div className="d-flex justify-content-between align-items-center mb-1">
        <h4 className="mb-0">Head of Department Dashboard</h4>
        <Button as={Link} to="/requisitions/new" className="btn-plasu">
          + New Requisition
        </Button>
      </div>
      <p className="text-muted">Raise and track requisitions against available store inventory.</p>

      <Row>
        <StatCard label="Total Requisitions" value={stats.myTotal} />
        <StatCard label="Pending" value={stats.myPending} warn={stats.myPending > 0} />
        <StatCard label="Approved (Awaiting Issue)" value={stats.myApproved} />
        <StatCard label="Issued" value={stats.myIssued} />
      </Row>

      <Card className="plasu-card p-3 mt-2">
        <h6>Recent Requisitions</h6>
        <Table responsive hover size="sm" className="table-plasu mb-0">
          <thead>
            <tr>
              <th>SRV No.</th>
              <th>Purpose</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stats.recentRequisitions.map((r) => (
              <tr key={r.id}>
                <td>{r.req_no}</td>
                <td>{r.purpose}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{formatDate(r.created_at)}</td>
                <td>
                  <Button as={Link} to={`/requisitions/${r.id}`} size="sm" variant="outline-plasu" className="btn-outline-plasu">
                    View
                  </Button>
                </td>
              </tr>
            ))}
            {stats.recentRequisitions.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted">No requisitions yet.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
