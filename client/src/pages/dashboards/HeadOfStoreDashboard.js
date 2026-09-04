import React, { useEffect, useState } from "react";
import { Row, Card, Table, Alert, Spinner, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import { formatDate } from "../../utils/formatDate";

export default function HeadOfStoreDashboard() {
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
      <h4 className="mb-1">Head of Store Dashboard</h4>
      <p className="text-muted">
        Review requisitions (approve, recommend changes or reject), sign clearance, issue approved
        items, manage stock and submit stock receipts for audit clearance.
      </p>

      <Row>
        <StatCard label="Awaiting Review" value={stats.pendingApproval} warn={stats.pendingApproval > 0} md={3} to="/requisitions?status=pending" />
        <StatCard label="With Requester" value={stats.awaitingRequesterAccept} md={3} to="/requisitions?status=recommended" />
        <StatCard label="Awaiting Signoff / Issue" value={stats.awaitingIssue} md={3} to="/requisitions?status=approved" />
        <StatCard label="Low Stock Items" value={stats.lowStockItems.length} warn={stats.lowStockItems.length > 0} md={3} to="/inventory?status=low" />
      </Row>
      <Row>
        <StatCard label="Uncleared Stock Receipts" value={stats.unclearedReceipts} warn={stats.unclearedReceipts > 0} md={3} to="/clearance" />
        <StatCard label="Clearance Requests Pending" value={stats.pendingClearance} md={3} to="/clearance?status=pending" />
        <StatCard label="Issued This Year" value={stats.issuedThisYear} md={3} to="/requisitions?status=issued&preset=year" />
      </Row>

      <Row>
        <Card className="plasu-card m-2 p-3" style={{ flex: 1 }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="mb-0">Requisitions Needing Attention</h6>
            <Button as={Link} to="/requisitions" size="sm" className="btn-plasu">View all</Button>
          </div>
          <Table size="sm" className="table-plasu mb-0">
            <thead><tr><th>SRV No.</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {stats.pendingList.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/requisitions/${r.id}`}>{r.req_no}</Link></td>
                  <td><StatusBadge status={r.status} plain /></td>
                  <td>{formatDate(r.created_at)}</td>
                </tr>
              ))}
              {stats.pendingList.length === 0 && <tr><td colSpan={3} className="text-muted text-center">Nothing pending.</td></tr>}
            </tbody>
          </Table>
        </Card>

        <Card className="plasu-card m-2 p-3" style={{ flex: 1 }}>
          <h6>Approved — Awaiting Signoff / Issue</h6>
          <Table size="sm" className="table-plasu mb-0">
            <thead><tr><th>SRV No.</th><th>Approved</th></tr></thead>
            <tbody>
              {stats.awaitingIssueList.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/requisitions/${r.id}`}>{r.req_no}</Link></td>
                  <td>{r.approved_at ? formatDate(r.approved_at) : "—"}</td>
                </tr>
              ))}
              {stats.awaitingIssueList.length === 0 && <tr><td colSpan={2} className="text-muted text-center">None waiting.</td></tr>}
            </tbody>
          </Table>
        </Card>
      </Row>

      <Card className="plasu-card p-3 mt-2">
        <h6>Items at or Below Reorder Level</h6>
        <Table responsive size="sm" className="table-plasu mb-0">
          <thead>
            <tr><th>Code</th><th>Name</th><th>On Hand</th><th>Reorder Level</th></tr>
          </thead>
          <tbody>
            {stats.lowStockItems.map((i) => (
              <tr key={i.id}>
                <td>{i.code}</td>
                <td>{i.name}</td>
                <td>{i.quantity_on_hand} {i.unit}</td>
                <td>{i.reorder_level}</td>
              </tr>
            ))}
            {stats.lowStockItems.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted">All stock levels healthy.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
