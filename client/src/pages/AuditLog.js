import React, { useEffect, useState, useMemo } from "react";
import { Card, Table, Alert, Badge, Form } from "react-bootstrap";
import api from "../api/axios";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import { formatDateTime } from "../utils/formatDate";

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");

  useEffect(() => {
    api
      .get("/audit")
      .then((res) => setLogs(res.data.logs))
      .catch((err) => setError(err?.response?.data?.error || "Could not load audit log."));
  }, []);

  const actionTypes = useMemo(() => [...new Set(logs.map((l) => l.action))].sort(), [logs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (action && l.action !== action) return false;
      if (!term) return true;
      return (
        (l.actor_email || "").toLowerCase().includes(term) ||
        l.entity_type.toLowerCase().includes(term) ||
        (l.details || "").toLowerCase().includes(term)
      );
    });
  }, [logs, q, action]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(filtered, 25);

  return (
    <>
      <h4>Audit Log</h4>
      <p className="text-muted">System-wide activity trail for accountability and oversight.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Card className="plasu-card p-3">
        <Toolbar
          search={q}
          onSearchChange={setQ}
          placeholder="Search by actor, entity or details…"
          filters={
            <Form.Select size="sm" value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 220 }}>
              <option value="">All Actions</option>
              {actionTypes.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Form.Select>
          }
        />
        <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr>
          </thead>
          <tbody>
            {pageRows.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.created_at)}</td>
                <td>{log.actor_email || "—"}</td>
                <td><Badge bg="secondary">{log.action}</Badge></td>
                <td>{log.entity_type} #{log.entity_id}</td>
                <td className="text-muted small">{log.details}</td>
              </tr>
            ))}
            {pageRows.length === 0 && <tr><td colSpan={5} className="text-center text-muted">No activity recorded yet.</td></tr>}
          </tbody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
      </Card>
    </>
  );
}
