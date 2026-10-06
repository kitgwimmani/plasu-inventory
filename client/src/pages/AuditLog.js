import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card, Table, Alert, Badge, Form, Row } from "react-bootstrap";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import useReportColumns from "../hooks/useReportColumns";
import StatCard from "../components/StatCard";
import ColumnsMenu from "../components/reports/ColumnsMenu";
import ReportActions from "../components/reports/ReportActions";
import PrintOverlay from "../components/print/PrintOverlay";
import AuditLogPrint from "../components/print/AuditLogPrint";
import { presetLabel, presetToRange } from "../utils/dateRanges";
import { formatDateTime } from "../utils/formatDate";

const AUDIT_COLUMNS = [
  { key: "when", label: "When", required: true, csv: (l) => formatDateTime(l.created_at), render: (l) => formatDateTime(l.created_at) },
  {
    key: "actor",
    label: "Actor",
    required: true,
    csv: (l) => l.actor_name ? `${l.actor_name} (${l.actor_email || "—"})` : (l.actor_email || "—"),
    render: (l) => (
      <>
        {l.actor_name || "—"}
        {l.actor_email && <div className="text-muted small">{l.actor_email}</div>}
      </>
    ),
  },
  { key: "action", label: "Action", csv: (l) => l.action, render: (l) => <Badge bg="secondary">{l.action}</Badge> },
  { key: "entity", label: "Entity", csv: (l) => `${l.entity_type} #${l.entity_id}`, render: (l) => `${l.entity_type} #${l.entity_id}` },
  { key: "details", label: "Details", csv: (l) => l.details || "", render: (l) => <span className="text-muted small">{l.details}</span> },
];

// This is itself a report — the system-wide activity trail used for
// accountability and oversight — so it gets the same filter/column/export
// treatment as the Reports page, just restricted to superadmin/ictadmin.
export default function AuditLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [preset, setPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  const { columns, allColumns, isVisible, toggle, resetColumns } = useReportColumns("audit-log", AUDIT_COLUMNS);

  const load = useCallback(() => {
    setLoading(true);
    const range = presetToRange(preset, customFrom, customTo);
    const params = { ...range, limit: 0 };
    if (q) params.q = q;
    if (action) params.action = action;
    api
      .get("/audit", { params })
      .then((res) => {
        setLogs(res.data.logs);
        setError("");
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load audit log."))
      .finally(() => setLoading(false));
  }, [q, action, preset, customFrom, customTo]);

  useEffect(load, [load]);

  const actionTypes = useMemo(() => [...new Set(logs.map((l) => l.action))].sort(), [logs]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(logs, 25);

  const filtersSummary = useMemo(() => {
    const parts = [presetLabel(preset)];
    if (action) parts.push(`Action: ${action}`);
    if (q) parts.push(`Search: "${q}"`);
    return parts.join(" · ");
  }, [preset, action, q]);

  return (
    <>
      <h4>Audit Log</h4>
      <p className="text-muted">System-wide activity trail for accountability and oversight.</p>
      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}

      <Row>
        <StatCard label="Total Entries" value={total} md={3} />
        <StatCard label="Distinct Actions" value={actionTypes.length} md={3} />
      </Row>

      <Card className="plasu-card p-3">
        <Toolbar
          search={q}
          onSearchChange={setQ}
          placeholder="Search by actor, entity or details…"
          filters={
            <>
              <Form.Select size="sm" value={preset} onChange={(e) => setPreset(e.target.value)} style={{ width: 150 }}>
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </Form.Select>
              {preset === "custom" && (
                <>
                  <Form.Control size="sm" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: 150 }} />
                  <Form.Control size="sm" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: 150 }} />
                </>
              )}
              <Form.Select size="sm" value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 220 }}>
                <option value="">All Actions</option>
                {actionTypes.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Form.Select>
            </>
          }
          actions={
            <>
              <ColumnsMenu allColumns={allColumns} isVisible={isVisible} toggle={toggle} resetColumns={resetColumns} />
              <ReportActions
                disabled={loading || logs.length === 0}
                onPrint={() => setShowPrint(true)}
                csv={{ filename: "audit-trail-report", columns, rows: logs }}
                pdf={{
                  filename: "audit-trail-report",
                  title: "Audit Trail Report",
                  filtersSummary,
                  generatedBy: user.name,
                  columns,
                  rows: logs,
                  summaryLines: [`Total Entries: ${logs.length}`],
                  signatureLabels: ["Compiled By (ICT Admin)", "Reviewed By (Internal Audit)"],
                }}
              />
            </>
          }
        />
        {loading ? (
          <div className="text-center py-4 text-muted">Loading…</div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead>
                <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {pageRows.map((log) => (
                  <tr key={log.id}>
                    {columns.map((c) => <td key={c.key}>{c.render(log)}</td>)}
                  </tr>
                ))}
                {pageRows.length === 0 && <tr><td colSpan={columns.length} className="text-center text-muted">No activity recorded yet.</td></tr>}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)} defaultLandscape defaultCompact>
        <AuditLogPrint logs={logs} filtersSummary={filtersSummary} generatedBy={user.name} />
      </PrintOverlay>
    </>
  );
}
