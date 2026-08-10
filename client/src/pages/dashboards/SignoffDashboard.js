import React, { useEffect, useState } from "react";
import { Row, Card, Table, Alert, Spinner, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import StatCard from "../../components/StatCard";
import { useAuth, ROLE_LABELS } from "../../context/AuthContext";
import { formatDate } from "../../utils/formatDate";

export default function SignoffDashboard() {
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
      <h4 className="mb-1">{ROLE_LABELS[user.role]} Dashboard</h4>
      <p className="text-muted">
        Review approved requisitions and record your clearance signature. Once every
        party has signed, the Inventory Admin can issue the item(s).
      </p>

      <Row>
        <StatCard label="Awaiting My Signature" value={stats.awaitingMySignoffCount} warn={stats.awaitingMySignoffCount > 0} md={4} to="/requisitions?status=approved" />
        <StatCard label="Total Signed by Me" value={stats.signedByMeCount} md={4} />
      </Row>

      <Card className="plasu-card p-3 mt-2">
        <h6>Requisitions Awaiting My Signature</h6>
        <Table responsive hover size="sm" className="table-plasu mb-0">
          <thead>
            <tr>
              <th>SRV No.</th>
              <th>Department</th>
              <th>Purpose</th>
              <th>Approved On</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stats.awaitingMySignoff.map((r) => (
              <tr key={r.id}>
                <td>{r.req_no}</td>
                <td>{r.department}</td>
                <td>{r.purpose}</td>
                <td>{r.approved_at ? formatDate(r.approved_at) : "—"}</td>
                <td>
                  <Button as={Link} to={`/requisitions/${r.id}`} size="sm" className="btn-plasu">
                    Review &amp; Sign
                  </Button>
                </td>
              </tr>
            ))}
            {stats.awaitingMySignoff.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted">Nothing awaiting your signature.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
