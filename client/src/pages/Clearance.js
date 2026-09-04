import React, { useEffect, useState, useCallback } from "react";
import { Card, Table, Button, Alert, Form, Modal, Badge, Row, Col } from "react-bootstrap";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useAuth, hasRole } from "../context/AuthContext";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import { formatDate } from "../utils/formatDate";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function Clearance() {
  const { user } = useAuth();
  const canCreate = hasRole(user, "head_of_store", "superadmin", "ictadmin");
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [remark, setRemark] = useState("");
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const params = {};
    if (status) params.status = status;
    api
      .get("/clearance", { params })
      .then((res) => setRows(res.data.clearance_requests))
      .catch((err) => setError(err?.response?.data?.error || "Could not load clearance requests."));
  }, [status]);

  useEffect(load, [load]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(rows, 10);

  const loadPreview = useCallback(() => {
    if (!dateFrom || !dateTo) return;
    api
      .get("/clearance/receipts", { params: { date_from: dateFrom, date_to: dateTo } })
      .then((res) => setPreview(res.data.receipts))
      .catch((err) => setError(err?.response?.data?.error || "Could not load receipts."));
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (showNew) loadPreview();
  }, [showNew, loadPreview]);

  const handleCreate = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.post("/clearance", { date_from: dateFrom, date_to: dateTo, remark });
      setShowNew(false);
      setRemark("");
      setSuccess(`Clearance request ${res.data.clearance_request.ref_no} created.`);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not create clearance request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Stock Receipt Clearance</h4>
          <p className="text-muted mb-0">
            Batches of stock receipts submitted for sign-off by the Technical Expert, Audit Officer
            and Asset &amp; Insurance Officer.
          </p>
        </div>
        {canCreate && (
          <Button className="btn-plasu" onClick={() => { setShowNew(true); setError(""); }}>
            <i className="bi bi-plus-lg me-1" />New Clearance Request
          </Button>
        )}
      </div>

      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess("")} dismissible>{success}</Alert>}

      <Card className="plasu-card p-3">
        <div className="d-flex justify-content-end mb-2">
          <Form.Select size="sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 160 }}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="cleared">Cleared</option>
          </Form.Select>
        </div>
        <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
          <thead>
            <tr>
              <th>Ref No.</th>
              <th>Period</th>
              <th>Receipts</th>
              <th>Signatures</th>
              <th>Submitted By</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => (
              <tr key={c.id}>
                <td>{c.ref_no}</td>
                <td>{formatDate(c.date_from)} – {formatDate(c.date_to)}</td>
                <td>{c.receipt_count}</td>
                <td>{c.signed_count} / 3</td>
                <td>{c.created_by_name}</td>
                <td>
                  <Badge bg={c.status === "cleared" ? "success" : "secondary"}>
                    {c.status === "cleared" ? "Cleared" : "Pending"}
                  </Badge>
                </td>
                <td>
                  <Button as={Link} to={`/clearance/${c.id}`} size="sm" variant="outline-secondary">View</Button>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted">No clearance requests found.</td></tr>
            )}
          </tbody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
      </Card>

      <Modal show={showNew} onHide={() => setShowNew(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>New Clearance Request</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Row className="g-2 mb-3">
            <Col md={4}>
              <Form.Label>From</Form.Label>
              <Form.Control type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Col>
            <Col md={4}>
              <Form.Label>To</Form.Label>
              <Form.Control type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Col>
            <Col md={4} className="d-flex align-items-end">
              <Button variant="outline-secondary" className="w-100" onClick={loadPreview}>Refresh</Button>
            </Col>
          </Row>
          <Form.Group className="mb-3">
            <Form.Label>Remark (optional)</Form.Label>
            <Form.Control as="textarea" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
          </Form.Group>
          <strong>Uncleared receipts in this range</strong>
          <Table size="sm" className="table-plasu mt-2">
            <thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Received By</th></tr></thead>
            <tbody>
              {(preview || []).map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.created_at)}</td>
                  <td>{r.item_code} — {r.item_name}</td>
                  <td>{r.qty} {r.unit}</td>
                  <td>{r.received_by_name || "—"}</td>
                </tr>
              ))}
              {preview && preview.length === 0 && (
                <tr><td colSpan={4} className="text-center text-muted">No uncleared receipts in this range.</td></tr>
              )}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
          <Button
            className="btn-plasu"
            disabled={saving || !preview || preview.length === 0}
            onClick={handleCreate}
          >
            {saving ? "Creating…" : `Submit ${preview ? preview.length : 0} Receipt(s) for Clearance`}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
