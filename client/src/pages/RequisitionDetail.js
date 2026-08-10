import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Card, Table, Button, Alert, Row, Col, Form, Modal, Badge } from "react-bootstrap";
import api from "../api/axios";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import PrintOverlay from "../components/print/PrintOverlay";
import ReceiptView from "../components/print/ReceiptView";

const SIGNOFF_LABELS = {
  requester: "Requester / User (HOD)",
  technical_expert: "Technical Expert",
  audit_officer: "Audit Officer",
  asset_officer: "Asset / Insurance Officer",
};

const ADMIN_OVERRIDE_ROLES = ["superadmin", "ictadmin", "inventoryadmin"];

export default function RequisitionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showPrint, setShowPrint] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/requisitions/${id}`)
      .then((res) => setReq(res.data.requisition))
      .catch((err) => setError(err?.response?.data?.error || "Could not load requisition."));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!req) return <p className="text-muted">Loading…</p>;

  const isInventoryAdmin = user.role === "inventoryadmin";
  const allSigned = req.signoffs.every((s) => s.signed);

  // Can the logged-in user act on this particular signoff slot?
  const canActOnSignoff = (s) => {
    if (s.role_label === "requester" && req.hod_id === user.id) return true;
    if (user.role === s.role_label) return true;
    if (ADMIN_OVERRIDE_ROLES.includes(user.role)) return true;
    return false;
  };

  const doAction = async (fn) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = () =>
    doAction(async () => {
      await api.put(`/requisitions/${id}/approve`);
      setSuccess("Requisition approved. Clearance signoffs are now required before issue.");
    });

  const handleReject = () =>
    doAction(async () => {
      await api.put(`/requisitions/${id}/reject`, { reason: rejectReason });
      setShowReject(false);
      setSuccess("Requisition rejected.");
    });

  const handleSign = (roleLabel) =>
    doAction(async () => {
      await api.put(`/requisitions/${id}/signoff`, { role_label: roleLabel, signed: true });
      setSuccess("Your signature has been recorded.");
    });

  const handleUnsign = (roleLabel) =>
    doAction(async () => {
      await api.put(`/requisitions/${id}/signoff`, { role_label: roleLabel, signed: false });
    });

  const handleIssue = () =>
    doAction(async () => {
      await api.put(`/requisitions/${id}/issue`);
      setSuccess("Item(s) issued and stock updated.");
    });

  return (
    <>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h4 className="mb-0">{req.req_no}</h4>
          <div className="text-muted">{req.department_name_current || req.department} &middot; requested by {req.hod_name}</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <StatusBadge status={req.status} />
          {req.status === "issued" && (
            <Button size="sm" variant="outline-secondary" onClick={() => setShowPrint(true)}>
              <i className="bi bi-printer me-1" />Print Receipt
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess("")} dismissible>{success}</Alert>}

      <Card className="plasu-card p-3 mb-3">
        <Row>
          <Col md={8}><strong>Purpose:</strong> {req.purpose}</Col>
          <Col md={4} className="text-md-end text-muted">
            Raised: {new Date(req.created_at).toLocaleString()}
          </Col>
        </Row>
        {req.status === "rejected" && (
          <Alert variant="danger" className="mt-3 mb-0">
            Rejected on {new Date(req.rejected_at).toLocaleString()}. Reason: {req.rejection_reason || "—"}
          </Alert>
        )}
        {req.status === "issued" && (
          <Alert variant="success" className="mt-3 mb-0">
            Issued on {new Date(req.issued_at).toLocaleString()} by {req.issued_by_name}.
          </Alert>
        )}
      </Card>

      <Card className="plasu-card p-3 mb-3">
        <h6>Requested Items</h6>
        <Table size="sm" className="table-plasu mb-0">
          <thead><tr><th>Code</th><th>Item</th><th>Packaging</th><th>Qty Requested</th><th>Currently On Hand</th></tr></thead>
          <tbody>
            {req.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.item_code}</td>
                <td>{l.item_name}</td>
                <td>{l.pack_qty ? `${l.pack_qty} × ${l.packaging_label}` : "—"}</td>
                <td>{l.qty_requested} {l.unit}</td>
                <td>{l.quantity_on_hand} {l.unit}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {req.status === "pending" && isInventoryAdmin && (
        <Card className="plasu-card p-3 mb-3">
          <h6>Approval Decision</h6>
          <p className="text-muted">Approve to proceed to clearance signoffs, or reject with a reason.</p>
          <div className="d-flex gap-2">
            <Button className="btn-plasu" disabled={busy} onClick={handleApprove}>Approve</Button>
            <Button variant="outline-danger" disabled={busy} onClick={() => setShowReject(true)}>Reject</Button>
          </div>
        </Card>
      )}

      {(req.status === "approved" || req.status === "issued") && (
        <Card className="plasu-card p-3 mb-3">
          <h6>Clearance Signoffs</h6>
          <p className="text-muted">
            Each party signs in with their own account and signs their own line below. All four
            must sign before the item(s) can be issued.
          </p>
          <Table size="sm" className="table-plasu mb-0">
            <thead><tr><th>Party</th><th>Status</th><th>Signed By</th><th>Date</th>{req.status === "approved" && <th></th>}</tr></thead>
            <tbody>
              {req.signoffs.map((s) => {
                const canAct = req.status === "approved" && canActOnSignoff(s);
                return (
                  <tr key={s.role_label}>
                    <td>{SIGNOFF_LABELS[s.role_label]}</td>
                    <td>
                      {s.signed ? <Badge bg="success">Signed</Badge> : <Badge bg="secondary">Pending</Badge>}
                    </td>
                    <td>{s.signed_by_name || "—"}</td>
                    <td>{s.signed_at ? new Date(s.signed_at).toLocaleString() : "—"}</td>
                    {req.status === "approved" && (
                      <td>
                        {!canAct ? null : s.signed ? (
                          <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => handleUnsign(s.role_label)}>
                            Undo
                          </Button>
                        ) : (
                          <Button size="sm" className="btn-plasu" disabled={busy} onClick={() => handleSign(s.role_label)}>
                            Sign as {user.name}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {req.status === "approved" && isInventoryAdmin && (
        <Card className="plasu-card p-3 mb-3">
          <h6>Issue Item(s)</h6>
          <p className="text-muted">
            {allSigned
              ? "All parties have signed. You may now issue the item(s); stock will be deducted."
              : "Waiting on all four signoffs before item(s) can be issued."}
          </p>
          <Button className="btn-plasu" disabled={busy || !allSigned} onClick={handleIssue}>
            Issue Item(s)
          </Button>
        </Card>
      )}

      {/* Reject modal */}
      <Modal show={showReject} onHide={() => setShowReject(false)}>
        <Modal.Header closeButton><Modal.Title>Reject Requisition</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Reason for rejection</Form.Label>
            <Form.Control as="textarea" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowReject(false)}>Cancel</Button>
          <Button variant="danger" disabled={busy || !rejectReason.trim()} onClick={handleReject}>Confirm Reject</Button>
        </Modal.Footer>
      </Modal>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)}>
        <ReceiptView requisition={req} />
      </PrintOverlay>
    </>
  );
}
