import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Card, Table, Button, Alert, Row, Col, Form, Modal, Badge } from "react-bootstrap";
import api from "../api/axios";
import StatusBadge from "../components/StatusBadge";
import { useAuth, hasRole } from "../context/AuthContext";
import PrintOverlay from "../components/print/PrintOverlay";
import ReceiptView from "../components/print/ReceiptView";
import { formatDateTime } from "../utils/formatDate";

const SIGNOFF_LABELS = {
  head_of_store: "Head of Store",
  issuance_officer: "Issuance Officer",
};

export default function RequisitionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRecommend, setShowRecommend] = useState(false);
  const [recQty, setRecQty] = useState({});
  const [recRemark, setRecRemark] = useState("");
  const [showPrint, setShowPrint] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/requisitions/${id}`)
      .then((res) => setReq(res.data.requisition))
      .catch((err) => setError(err?.response?.data?.error || "Could not load requisition."));
  }, [id]);

  useEffect(load, [load]);

  if (error && !req) return <Alert variant="danger">{error}</Alert>;
  if (!req) return <p className="text-muted">Loading…</p>;

  const isHeadOfStore = hasRole(user, "head_of_store");
  const isAdmin = hasRole(user, "superadmin", "ictadmin");
  const isOwner = req.hod_id === user.id;
  const allSigned = req.signoffs.length > 0 && req.signoffs.every((s) => s.signed);
  const hosSigned = req.signoffs.find((s) => s.role_label === "head_of_store")?.signed;

  const canActOnSignoff = (s) => {
    if (!hasRole(user, s.role_label) && !isAdmin) return false;
    if (s.role_label === "issuance_officer" && !s.signed && !hosSigned) return false;
    return true;
  };
  const canIssue = hasRole(user, "head_of_store", "issuance_officer", "superadmin", "ictadmin");

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
      setSuccess("Requisition approved. Clearance signatures are now required before issue.");
    });

  const openRecommend = () => {
    const seed = {};
    req.lines.forEach((l) => { seed[l.id] = l.qty_recommended ?? l.qty_requested; });
    setRecQty(seed);
    setRecRemark("");
    setShowRecommend(true);
  };

  const handleRecommend = () =>
    doAction(async () => {
      const changed = req.lines
        .filter((l) => Number(recQty[l.id]) !== Number(l.qty_requested))
        .map((l) => ({ line_id: l.id, qty_recommended: Number(recQty[l.id]) }));
      if (changed.length === 0) {
        const e = new Error("Change at least one quantity, or use Approve.");
        e.response = { data: { error: e.message } };
        throw e;
      }
      await api.put(`/requisitions/${id}/recommend`, { lines: changed, remark: recRemark });
      setShowRecommend(false);
      setSuccess("Recommendation sent to the requester.");
    });

  const handleReject = () =>
    doAction(async () => {
      await api.put(`/requisitions/${id}/reject`, { reason: rejectReason });
      setShowReject(false);
      setSuccess("Requisition rejected.");
    });

  const handleAccept = () =>
    doAction(async () => {
      await api.put(`/requisitions/${id}/accept`);
      setSuccess("You accepted the recommended changes. The requisition is now approved.");
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

  const hasRecommendation = req.lines.some((l) => l.qty_recommended != null);

  return (
    <>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h4 className="mb-0">{req.req_no}</h4>
          <div className="text-muted">
            {req.department_name_current || req.department} &middot; requested by {req.hod_name}
          </div>
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
          <Col md={4} className="text-md-end text-muted">Raised: {formatDateTime(req.created_at)}</Col>
        </Row>
        {req.status === "rejected" && (
          <Alert variant="danger" className="mt-3 mb-0">
            Rejected on {formatDateTime(req.rejected_at)} by {req.rejected_by_name || "—"}. Reason: {req.rejection_reason || "—"}
          </Alert>
        )}
        {(req.status === "recommended" || (hasRecommendation && req.recommendation_remark)) && (
          <Alert variant="warning" className="mt-3 mb-0">
            <strong>Head of Store recommendation</strong>
            {req.recommended_by_name ? ` (by ${req.recommended_by_name})` : ""}: {req.recommendation_remark || "—"}
          </Alert>
        )}
        {req.status === "issued" && (
          <Alert variant="success" className="mt-3 mb-0">
            Issued on {formatDateTime(req.issued_at)} by {req.issued_by_name}.
          </Alert>
        )}
      </Card>

      <Card className="plasu-card p-3 mb-3">
        <h6>Requested Items</h6>
        <Table size="sm" className="table-plasu mb-0">
          <thead>
            <tr>
              <th>Code</th><th>Item</th><th>Packaging</th><th>Qty Requested</th>
              {hasRecommendation && <th>Recommended</th>}
              <th>On Hand</th>
            </tr>
          </thead>
          <tbody>
            {req.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.item_code}</td>
                <td>
                  {l.item_name}
                  {l.is_adhoc ? <Badge bg="info" className="ms-1">new item</Badge> : null}
                </td>
                <td>{l.pack_qty ? `${l.pack_qty} × ${l.packaging_label}` : "—"}</td>
                <td>{l.qty_requested} {l.unit}</td>
                {hasRecommendation && (
                  <td>{l.qty_recommended != null ? <strong>{l.qty_recommended} {l.unit}</strong> : "—"}</td>
                )}
                <td>{l.quantity_on_hand != null ? `${l.quantity_on_hand} ${l.unit}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {req.status === "pending" && isHeadOfStore && (
        <Card className="plasu-card p-3 mb-3">
          <h6>Head of Store Decision</h6>
          <p className="text-muted">
            Approve as requested, recommend changed quantities (the requester must accept), or reject
            with a remark.
          </p>
          <div className="d-flex gap-2">
            <Button className="btn-plasu" disabled={busy} onClick={handleApprove}>Approve</Button>
            <Button variant="outline-primary" disabled={busy} onClick={openRecommend}>Recommend Changes</Button>
            <Button variant="outline-danger" disabled={busy} onClick={() => setShowReject(true)}>Reject</Button>
          </div>
        </Card>
      )}

      {req.status === "recommended" && isOwner && (
        <Card className="plasu-card p-3 mb-3">
          <h6>Review Recommended Changes</h6>
          <p className="text-muted">
            The Head of Store recommended the quantities shown above. Accepting them approves the
            requisition.
          </p>
          <Button className="btn-plasu" disabled={busy} onClick={handleAccept}>Accept &amp; Approve</Button>
        </Card>
      )}

      {req.status === "recommended" && !isOwner && (
        <Alert variant="info">Awaiting the requester's acceptance of the recommended changes.</Alert>
      )}

      {(req.status === "approved" || req.status === "issued") && (
        <Card className="plasu-card p-3 mb-3">
          <h6>Clearance Signatures</h6>
          <p className="text-muted">
            The Head of Store signs first, then the Issuance Officer. Both must sign before the
            item(s) can be issued.
          </p>
          <Table size="sm" className="table-plasu mb-0">
            <thead>
              <tr><th>Party</th><th>Status</th><th>Signed By</th><th>Date</th>{req.status === "approved" && <th></th>}</tr>
            </thead>
            <tbody>
              {req.signoffs.map((s) => {
                const canAct = req.status === "approved" && canActOnSignoff(s);
                return (
                  <tr key={s.role_label}>
                    <td>{SIGNOFF_LABELS[s.role_label]}</td>
                    <td>{s.signed ? <Badge bg="success">Signed</Badge> : <Badge bg="secondary">Pending</Badge>}</td>
                    <td>{s.signed_by_name || "—"}</td>
                    <td>{s.signed_at ? formatDateTime(s.signed_at) : "—"}</td>
                    {req.status === "approved" && (
                      <td>
                        {!canAct ? null : s.signed ? (
                          <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => handleUnsign(s.role_label)}>Undo</Button>
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

      {req.status === "approved" && canIssue && (
        <Card className="plasu-card p-3 mb-3">
          <h6>Issue Item(s)</h6>
          <p className="text-muted">
            {allSigned
              ? "Both parties have signed. You may now issue the item(s); stock will be deducted."
              : "Waiting on both signatures before item(s) can be issued."}
          </p>
          <Button className="btn-plasu" disabled={busy || !allSigned} onClick={handleIssue}>Issue Item(s)</Button>
        </Card>
      )}

      {/* Reject modal */}
      <Modal show={showReject} onHide={() => setShowReject(false)}>
        <Modal.Header closeButton><Modal.Title>Reject Requisition</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Reason for rejection (required)</Form.Label>
            <Form.Control as="textarea" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowReject(false)}>Cancel</Button>
          <Button variant="danger" disabled={busy || !rejectReason.trim()} onClick={handleReject}>Confirm Reject</Button>
        </Modal.Footer>
      </Modal>

      {/* Recommend modal */}
      <Modal show={showRecommend} onHide={() => setShowRecommend(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>Recommend Changes</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-muted">
            Adjust the quantities you recommend. The requester will see the change and must accept it
            for the requisition to be approved.
          </p>
          <Table size="sm" className="table-plasu">
            <thead><tr><th>Item</th><th>Requested</th><th>Recommended</th></tr></thead>
            <tbody>
              {req.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.item_name}</td>
                  <td>{l.qty_requested} {l.unit}</td>
                  <td style={{ maxWidth: 140 }}>
                    <Form.Control
                      type="number"
                      min="0"
                      value={recQty[l.id] ?? ""}
                      onChange={(e) => setRecQty({ ...recQty, [l.id]: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Form.Group>
            <Form.Label>Remark (required)</Form.Label>
            <Form.Control as="textarea" rows={3} value={recRemark} onChange={(e) => setRecRemark(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRecommend(false)}>Cancel</Button>
          <Button className="btn-plasu" disabled={busy || !recRemark.trim()} onClick={handleRecommend}>Send Recommendation</Button>
        </Modal.Footer>
      </Modal>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)}>
        <ReceiptView requisition={req} />
      </PrintOverlay>
    </>
  );
}
