import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Card, Table, Button, Alert, Row, Col, Form, Badge } from "react-bootstrap";
import api from "../api/axios";
import { useAuth, hasRole } from "../context/AuthContext";
import PrintOverlay from "../components/print/PrintOverlay";
import ClearancePrint from "../components/print/ClearancePrint";
import { formatDate, formatDateTime } from "../utils/formatDate";

const LABELS = {
  technical_expert: "Technical Expert",
  audit_officer: "Audit Officer",
  asset_officer: "Asset / Insurance Officer",
};

export default function ClearanceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [cr, setCr] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState({});
  const [showPrint, setShowPrint] = useState(false);

  const isAdmin = hasRole(user, "superadmin", "ictadmin");

  const load = useCallback(() => {
    api
      .get(`/clearance/${id}`)
      .then((res) => setCr(res.data.clearance_request))
      .catch((err) => setError(err?.response?.data?.error || "Could not load clearance request."));
  }, [id]);

  useEffect(load, [load]);

  if (error && !cr) return <Alert variant="danger">{error}</Alert>;
  if (!cr) return <p className="text-muted">Loading…</p>;

  const canActOn = (s) => (hasRole(user, s.role_label) || isAdmin) && cr.status === "pending";

  const doSign = (roleLabel, signed) => async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api.put(`/clearance/${id}/signoff`, {
        role_label: roleLabel,
        signed,
        remark: signed ? remarks[roleLabel] || "" : null,
      });
      setSuccess(signed ? "Your signature has been recorded." : "Signature withdrawn.");
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h4 className="mb-0">{cr.ref_no}</h4>
          <div className="text-muted">
            {formatDate(cr.date_from)} – {formatDate(cr.date_to)} &middot; submitted by {cr.created_by_name}
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Badge bg={cr.status === "cleared" ? "success" : "secondary"}>
            {cr.status === "cleared" ? "Cleared" : "Pending"}
          </Badge>
          <Button size="sm" variant="outline-secondary" onClick={() => setShowPrint(true)}>
            <i className="bi bi-printer me-1" />Print
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess("")} dismissible>{success}</Alert>}

      <Card className="plasu-card p-3 mb-3">
        <Row>
          <Col md={6}><strong>Receipts:</strong> {cr.receipt_count}</Col>
          <Col md={6} className="text-md-end text-muted">Created {formatDateTime(cr.created_at)}</Col>
        </Row>
        {cr.remark ? <div className="mt-2"><strong>Remark:</strong> {cr.remark}</div> : null}
        {cr.status === "cleared" && (
          <Alert variant="success" className="mt-3 mb-0">Cleared on {formatDateTime(cr.cleared_at)}.</Alert>
        )}
      </Card>

      <Card className="plasu-card p-3 mb-3">
        <h6>Stock Receipts in this Clearance</h6>
        <Table size="sm" className="table-plasu mb-0">
          <thead>
            <tr><th>Date</th><th>Code</th><th>Item</th><th>Packaging</th><th>Qty</th><th>Received By</th></tr>
          </thead>
          <tbody>
            {cr.receipts.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.created_at)}</td>
                <td>{r.item_code}</td>
                <td>{r.item_name}</td>
                <td>{r.pack_qty ? `${r.pack_qty} × ${r.packaging_label}` : "—"}</td>
                <td>{r.qty} {r.unit}</td>
                <td>{r.received_by_name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="plasu-card p-3 mb-3">
        <h6>Clearance Signatures</h6>
        <p className="text-muted">All three officers must sign for the receipts to be cleared.</p>
        <Table size="sm" className="table-plasu mb-0">
          <thead>
            <tr><th>Officer</th><th>Status</th><th>Signed By</th><th>Date</th><th>Remark</th>{cr.status === "pending" && <th></th>}</tr>
          </thead>
          <tbody>
            {cr.signoffs.map((s) => (
              <tr key={s.role_label}>
                <td>{LABELS[s.role_label]}</td>
                <td>{s.signed ? <Badge bg="success">Signed</Badge> : <Badge bg="secondary">Pending</Badge>}</td>
                <td>{s.signed_by_name || "—"}</td>
                <td>{s.signed_at ? formatDateTime(s.signed_at) : "—"}</td>
                <td>
                  {s.signed ? (
                    s.remark || "—"
                  ) : canActOn(s) ? (
                    <Form.Control
                      size="sm"
                      placeholder="Optional remark"
                      value={remarks[s.role_label] || ""}
                      onChange={(e) => setRemarks({ ...remarks, [s.role_label]: e.target.value })}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                {cr.status === "pending" && (
                  <td>
                    {!canActOn(s) ? null : s.signed ? (
                      <Button size="sm" variant="outline-secondary" disabled={busy} onClick={doSign(s.role_label, false)}>Undo</Button>
                    ) : (
                      <Button size="sm" className="btn-plasu" disabled={busy} onClick={doSign(s.role_label, true)}>
                        Sign as {user.name}
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)}>
        <ClearancePrint clearance={cr} generatedBy={user.name} />
      </PrintOverlay>
    </>
  );
}
