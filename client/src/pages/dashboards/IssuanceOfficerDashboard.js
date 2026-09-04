import React, { useEffect, useState } from "react";
import { Row, Card, Table, Alert, Spinner, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import StatCard from "../../components/StatCard";
import { formatDate } from "../../utils/formatDate";

export default function IssuanceOfficerDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard")
      .then((res) => setStats({ awaitingMySignature: [], ...res.data.stats }))
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
      <h4 className="mb-1">Issuance Officer Dashboard</h4>
      <p className="text-muted">
        Sign approved requisitions once the Head of Store has signed, then issue the item(s).
      </p>

      <Row>
        <StatCard label="Awaiting My Signature" value={stats.awaitingMySignatureCount} warn={stats.awaitingMySignatureCount > 0} md={4} to="/requisitions?status=approved" />
        <StatCard label="Ready to Issue" value={stats.awaitingIssue} md={4} to="/requisitions?status=approved" />
        <StatCard label="Issued This Year" value={stats.issuedThisYear} md={4} to="/requisitions?status=issued&preset=year" />
      </Row>

      <Card className="plasu-card p-3 mt-2">
        <h6>Requisitions Awaiting My Signature</h6>
        <Table responsive hover size="sm" className="table-plasu mb-0">
          <thead>
            <tr><th>SRV No.</th><th>Department</th><th>Purpose</th><th>Approved On</th><th></th></tr>
          </thead>
          <tbody>
            {stats.awaitingMySignature.map((r) => (
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
            {stats.awaitingMySignature.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted">Nothing awaiting your signature.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
