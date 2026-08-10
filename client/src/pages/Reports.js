import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card, Tabs, Tab, Row, Form, Button, Table, Alert, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import StatusBadge from "../components/StatusBadge";
import CategoryBadge from "../components/CategoryBadge";
import StatCard from "../components/StatCard";
import PrintOverlay from "../components/print/PrintOverlay";
import InventoryReportPrint from "../components/print/InventoryReportPrint";
import RequisitionsReportPrint from "../components/print/RequisitionsReportPrint";
import { presetLabel, presetToRange } from "../utils/dateRanges";

const FULL_ACCESS_ROLES = ["superadmin", "ictadmin", "inventoryadmin"];

function InventoryReportTab({ user }) {
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data.categories)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (categoryId) params.category_id = categoryId;
    if (status) params.status = status;
    api
      .get("/reports/inventory", { params })
      .then((res) => {
        setItems(res.data.items);
        setSummary(res.data.summary);
        setError("");
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load inventory report."))
      .finally(() => setLoading(false));
  }, [q, categoryId, status]);

  useEffect(load, [load]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(items, 10);

  const filtersSummary = useMemo(() => {
    const parts = [];
    if (categoryId) {
      const c = categories.find((c) => String(c.id) === String(categoryId));
      if (c) parts.push(`Category: ${c.name}`);
    }
    if (status) parts.push(`Status: ${status === "low" ? "Low Stock" : "Healthy"}`);
    if (q) parts.push(`Search: "${q}"`);
    return parts.length ? parts.join(" · ") : "All active inventory items";
  }, [categoryId, status, q, categories]);

  return (
    <>
      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}

      {summary && (
        <Row>
          <StatCard label="Total Items" value={summary.totalItems} md={3} />
          <StatCard label="Low Stock" value={summary.lowStockCount} warn={summary.lowStockCount > 0} md={3} />
          <StatCard label="Categories Represented" value={Object.keys(summary.byCategory).length} md={3} />
        </Row>
      )}

      <Card className="plasu-card p-3">
        <Toolbar
          search={q}
          onSearchChange={setQ}
          placeholder="Search by item name or code…"
          filters={
            <>
              <Form.Select size="sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: 180 }}>
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Form.Select>
              <Form.Select size="sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 160 }}>
                <option value="">All Statuses</option>
                <option value="low">Low Stock</option>
                <option value="healthy">Healthy</option>
              </Form.Select>
            </>
          }
          actions={
            <Button size="sm" className="btn-plasu" onClick={() => setShowPrint(true)} disabled={loading || items.length === 0}>
              <i className="bi bi-printer me-1" /> Print Report
            </Button>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th>On Hand (Best Fit)</th>
                  <th className="text-end">Reorder Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((i) => {
                  const bestFit = i.breakdown?.parts?.length
                    ? i.breakdown.parts.map((p) => `${p.count}×${p.label}`).join(", ") +
                      (i.breakdown.remainder ? ` +${i.breakdown.remainder} ${i.unit}` : "")
                    : `${i.quantity_on_hand} ${i.unit}`;
                  const low = i.quantity_on_hand <= i.reorder_level;
                  return (
                    <tr key={i.id}>
                      <td>{i.code}</td>
                      <td>{i.name}</td>
                      <td><CategoryBadge name={i.category_name} code={i.category_code} /></td>
                      <td className="small">{bestFit}</td>
                      <td className="text-end">{i.reorder_level} {i.unit}</td>
                      <td>
                        {low ? <span className="badge bg-warning text-dark">Low</span> : <span className="badge bg-success">Healthy</span>}
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted">No items match the selected filters.</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)}>
        {summary && (
          <InventoryReportPrint items={items} summary={summary} filtersSummary={filtersSummary} generatedBy={user.name} />
        )}
      </PrintOverlay>
    </>
  );
}

function RequisitionsReportTab({ user }) {
  const canSeeAll = FULL_ACCESS_ROLES.includes(user.role);
  const [departments, setDepartments] = useState([]);
  const [hods, setHods] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [hodId, setHodId] = useState("");
  const [preset, setPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
    if (canSeeAll) {
      api.get("/users/hods").then((res) => setHods(res.data.users)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const range = presetToRange(preset, customFrom, customTo);
    const params = { ...range };
    if (q) params.q = q;
    if (status) params.status = status;
    if (canSeeAll && departmentId) params.department_id = departmentId;
    if (canSeeAll && hodId) params.hod_id = hodId;
    api
      .get("/reports/requisitions", { params })
      .then((res) => {
        setRows(res.data.requisitions);
        setSummary(res.data.summary);
        setError("");
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load requisitions report."))
      .finally(() => setLoading(false));
  }, [q, status, departmentId, hodId, preset, customFrom, customTo, canSeeAll]);

  useEffect(load, [load]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(rows, 10);

  const filtersSummary = useMemo(() => {
    const parts = [presetLabel(preset)];
    if (status) parts.push(`Status: ${status}`);
    if (canSeeAll && departmentId) {
      const d = departments.find((d) => String(d.id) === String(departmentId));
      if (d) parts.push(`Department: ${d.name}`);
    }
    if (canSeeAll && hodId) {
      const h = hods.find((h) => String(h.id) === String(hodId));
      if (h) parts.push(`Requester: ${h.name}`);
    }
    if (q) parts.push(`Search: "${q}"`);
    return parts.join(" · ");
  }, [preset, status, departmentId, hodId, q, departments, hods, canSeeAll]);

  return (
    <>
      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}

      {summary && (
        <Row>
          <StatCard label="Total Requisitions" value={summary.totalCount} md={3} />
          <StatCard label="Pending" value={summary.byStatus.pending || 0} warn={(summary.byStatus.pending || 0) > 0} md={3} />
          <StatCard label="Approved" value={summary.byStatus.approved || 0} md={3} />
          <StatCard label="Issued" value={summary.byStatus.issued || 0} md={3} />
        </Row>
      )}

      <Card className="plasu-card p-3">
        <Toolbar
          search={q}
          onSearchChange={setQ}
          placeholder="Search by SRV No. or purpose…"
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
              <Form.Select size="sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 150 }}>
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="issued">Issued</option>
                <option value="rejected">Rejected</option>
              </Form.Select>
              {canSeeAll && (
                <>
                  <Form.Select size="sm" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: 170 }}>
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </Form.Select>
                  <Form.Select size="sm" value={hodId} onChange={(e) => setHodId(e.target.value)} style={{ width: 170 }}>
                    <option value="">All Requesters</option>
                    {hods.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </Form.Select>
                </>
              )}
            </>
          }
          actions={
            <Button size="sm" className="btn-plasu" onClick={() => setShowPrint(true)} disabled={loading || rows.length === 0}>
              <i className="bi bi-printer me-1" /> Print Report
            </Button>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead>
                <tr>
                  <th>SRV No.</th>
                  <th>Department</th>
                  <th>Requested By</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.req_no}</td>
                    <td>{r.department_name_current || r.department}</td>
                    <td>{r.hod_name}</td>
                    <td className="text-truncate" style={{ maxWidth: 220 }}>{r.purpose}</td>
                    <td><StatusBadge status={r.status} plain /></td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                      <Button as={Link} to={`/requisitions/${r.id}`} size="sm" variant="outline-secondary">View</Button>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted">No requisitions match the selected filters.</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)}>
        {summary && (
          <RequisitionsReportPrint requisitions={rows} summary={summary} filtersSummary={filtersSummary} generatedBy={user.name} />
        )}
      </PrintOverlay>
    </>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const [tab, setTab] = useState("inventory");

  return (
    <>
      <div className="mb-3">
        <h4 className="mb-0">Reports</h4>
        <p className="text-muted mb-0">
          Filter, review and print official reports with the institution letterhead and watermark.
        </p>
      </div>

      <Tabs activeKey={tab} onSelect={setTab} className="mb-3 plasu-tabs">
        <Tab eventKey="inventory" title={<><i className="bi bi-box-seam me-1" />Inventory Status</>}>
          <InventoryReportTab user={user} />
        </Tab>
        <Tab eventKey="requisitions" title={<><i className="bi bi-file-earmark-text me-1" />Requisitions</>}>
          <RequisitionsReportTab user={user} />
        </Tab>
      </Tabs>
    </>
  );
}
