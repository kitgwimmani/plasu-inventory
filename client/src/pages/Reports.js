import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card, Tabs, Tab, Row, Form, Alert, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth, hasRole, FULL_ACCESS_ROLES, SIGNOFF_ROLES, CLEARANCE_ROLES } from "../context/AuthContext";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import useReportColumns from "../hooks/useReportColumns";
import StatusBadge from "../components/StatusBadge";
import CategoryBadge from "../components/CategoryBadge";
import StatCard from "../components/StatCard";
import ColumnsMenu from "../components/reports/ColumnsMenu";
import ReportActions from "../components/reports/ReportActions";
import PrintOverlay from "../components/print/PrintOverlay";
import InventoryReportPrint from "../components/print/InventoryReportPrint";
import RequisitionsReportPrint from "../components/print/RequisitionsReportPrint";
import LowStockReportPrint from "../components/print/LowStockReportPrint";
import StockMovementsReportPrint from "../components/print/StockMovementsReportPrint";
import DepartmentSummaryReportPrint from "../components/print/DepartmentSummaryReportPrint";
import RequisitionSignoffReportPrint from "../components/print/RequisitionSignoffReportPrint";
import StockClearanceReportPrint from "../components/print/StockClearanceReportPrint";
import { presetLabel, presetToRange } from "../utils/dateRanges";
import { formatDate, formatDateTime } from "../utils/formatDate";
import SearchableSelect from "../components/SearchableSelect";

// Who may view the stock-receiving ledger: the people who record receipts,
// plus the three officers who clear them in batches (read-only for them).
const STOCK_MOVEMENT_ROLES = ["superadmin", "ictadmin", "head_of_store", ...CLEARANCE_ROLES];
// Stock-receipt clearance status is relevant to whoever submits/reviews a
// batch (Head of Store, admins) and the three officers who sign it.
const STOCK_CLEARANCE_VIEW_ROLES = ["superadmin", "ictadmin", "head_of_store", ...CLEARANCE_ROLES];

// Generic column-driven table body: every report defines its visible columns
// once (`{ key, label, align, render(row) }`) and renders the same way, so
// customizing which columns show on screen always matches exactly what goes
// into the CSV/PDF export built from the same column list.
function ColumnHeadRow({ columns }) {
  return (
    <tr>
      {columns.map((c) => (
        <th key={c.key} className={c.align === "end" ? "text-end" : ""}>{c.label}</th>
      ))}
    </tr>
  );
}
function ColumnBodyRow({ columns, row, rowKey }) {
  return (
    <tr key={rowKey}>
      {columns.map((c) => (
        <td key={c.key} className={c.align === "end" ? "text-end" : ""}>{c.render(row)}</td>
      ))}
    </tr>
  );
}

function bestFitText(i) {
  return i.breakdown?.parts?.length
    ? i.breakdown.parts.map((p) => `${p.count}×${p.label}`).join(", ") +
        (i.breakdown.remainder ? ` +${i.breakdown.remainder} ${i.unit}` : "")
    : `${i.quantity_on_hand} ${i.unit}`;
}

// ===========================================================================
// 1. Inventory Status
// ===========================================================================
const INVENTORY_COLUMNS = [
  { key: "code", label: "Code", required: true, csv: (i) => i.code, render: (i) => i.code },
  { key: "name", label: "Item", required: true, csv: (i) => i.name, render: (i) => i.name },
  {
    key: "category",
    label: "Category",
    csv: (i) => i.category_name || "Uncategorized",
    render: (i) => <CategoryBadge name={i.category_name} code={i.category_code} />,
  },
  { key: "subcategory", label: "Subcategory", csv: (i) => i.subcategory_name || "—", render: (i) => i.subcategory_name || "—" },
  { key: "department", label: "Department", csv: (i) => i.department_name || "—", render: (i) => i.department_name || "—" },
  {
    key: "bestFit",
    label: "On Hand (Best Fit)",
    csv: (i) => bestFitText(i),
    render: (i) => <span className="small">{bestFitText(i)}</span>,
  },
  {
    key: "onHandBase",
    label: "On Hand (Base Unit)",
    align: "end",
    csv: (i) => `${i.quantity_on_hand} ${i.unit}`,
    render: (i) => `${i.quantity_on_hand} ${i.unit}`,
  },
  {
    key: "reorder",
    label: "Reorder Level",
    align: "end",
    csv: (i) => `${i.reorder_level} ${i.unit}`,
    render: (i) => `${i.reorder_level} ${i.unit}`,
  },
  {
    key: "status",
    label: "Status",
    csv: (i) => (i.quantity_on_hand <= i.reorder_level ? "Low" : "Healthy"),
    render: (i) =>
      i.quantity_on_hand <= i.reorder_level ? (
        <span className="badge bg-warning text-dark">Low</span>
      ) : (
        <span className="badge bg-success">Healthy</span>
      ),
  },
];

function InventoryReportTab({ user }) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  const { columns, allColumns, isVisible, toggle, resetColumns } = useReportColumns("inventory", INVENTORY_COLUMNS);

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data.categories)).catch(() => {});
    api.get("/categories/subcategories/all").then((res) => setSubcategories(res.data.subcategories)).catch(() => {});
    api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
  }, []);

  const subsForCategory = subcategories.filter((s) => !categoryId || String(s.category_id) === String(categoryId));
  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const subcategoryOptions = subsForCategory.map((s) => ({ value: String(s.id), label: s.name }));
  const departmentOptions = departments.map((d) => ({ value: String(d.id), label: d.name }));

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (categoryId) params.category_id = categoryId;
    if (subcategoryId) params.subcategory_id = subcategoryId;
    if (departmentId) params.department_id = departmentId;
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
  }, [q, categoryId, subcategoryId, departmentId, status]);

  useEffect(load, [load]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(items, 10);

  const filtersSummary = useMemo(() => {
    const parts = [];
    if (categoryId) {
      const c = categories.find((c) => String(c.id) === String(categoryId));
      if (c) parts.push(`Category: ${c.name}`);
    }
    if (subcategoryId) {
      const s = subcategories.find((s) => String(s.id) === String(subcategoryId));
      if (s) parts.push(`Subcategory: ${s.name}`);
    }
    if (departmentId) {
      const d = departments.find((d) => String(d.id) === String(departmentId));
      if (d) parts.push(`Department: ${d.name}`);
    }
    if (status) parts.push(`Status: ${status === "low" ? "Low Stock" : "Healthy"}`);
    if (q) parts.push(`Search: "${q}"`);
    return parts.length ? parts.join(" · ") : "All active inventory items";
  }, [categoryId, subcategoryId, departmentId, status, q, categories, subcategories, departments]);

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
              <SearchableSelect
                size="sm"
                style={{ width: 160 }}
                placeholder="All Categories"
                value={categoryId}
                onChange={(v) => { setCategoryId(v); setSubcategoryId(""); }}
                options={categoryOptions}
              />
              <SearchableSelect
                size="sm"
                style={{ width: 160 }}
                placeholder="All Subcategories"
                value={subcategoryId}
                onChange={setSubcategoryId}
                options={subcategoryOptions}
              />
              <SearchableSelect
                size="sm"
                style={{ width: 160 }}
                placeholder="All Departments"
                value={departmentId}
                onChange={setDepartmentId}
                options={departmentOptions}
              />
              <Form.Select size="sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }}>
                <option value="">All Statuses</option>
                <option value="low">Low Stock</option>
                <option value="healthy">Healthy</option>
              </Form.Select>
            </>
          }
          actions={
            <>
              <ColumnsMenu allColumns={allColumns} isVisible={isVisible} toggle={toggle} resetColumns={resetColumns} />
              <ReportActions
                disabled={loading || items.length === 0}
                onPrint={() => setShowPrint(true)}
                csv={{ filename: "inventory-status-report", columns, rows: items }}
                pdf={{
                  filename: "inventory-status-report",
                  title: "Inventory Status Report",
                  filtersSummary,
                  generatedBy: user.name,
                  columns,
                  rows: items,
                  summaryLines: summary
                    ? [`Total Items: ${summary.totalItems}`, `Low Stock: ${summary.lowStockCount}`, `Categories: ${Object.keys(summary.byCategory).length}`]
                    : [],
                  signatureLabels: ["Prepared By (Store Officer)", "Verified By (Head of Store)", "Approved By (ICT Admin)"],
                }}
              />
            </>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead><ColumnHeadRow columns={columns} /></thead>
              <tbody>
                {pageRows.map((i) => <ColumnBodyRow key={i.id} rowKey={i.id} columns={columns} row={i} />)}
                {pageRows.length === 0 && (
                  <tr><td colSpan={columns.length} className="text-center text-muted">No items match the selected filters.</td></tr>
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

// ===========================================================================
// 2. Low Stock / Reorder — a focused, actionable view (separate from the full
// inventory listing) so whoever is responsible for purchasing can see exactly
// what to buy and how much, without filtering a larger table every time.
// ===========================================================================
const LOW_STOCK_COLUMNS = [
  { key: "code", label: "Code", required: true, csv: (i) => i.code, render: (i) => i.code },
  { key: "name", label: "Item", required: true, csv: (i) => i.name, render: (i) => i.name },
  { key: "category", label: "Category", csv: (i) => i.category_name || "Uncategorized", render: (i) => <CategoryBadge name={i.category_name} code={i.category_code} /> },
  { key: "department", label: "Department", csv: (i) => i.department_name || "—", render: (i) => i.department_name || "—" },
  { key: "onHand", label: "On Hand", align: "end", csv: (i) => `${i.quantity_on_hand} ${i.unit}`, render: (i) => `${i.quantity_on_hand} ${i.unit}` },
  { key: "reorderLevel", label: "Reorder Level", align: "end", csv: (i) => `${i.reorder_level} ${i.unit}`, render: (i) => `${i.reorder_level} ${i.unit}` },
  { key: "deficit", label: "Deficit", align: "end", csv: (i) => `${i.deficit} ${i.unit}`, render: (i) => <strong className="text-danger">{i.deficit} {i.unit}</strong> },
  { key: "suggested", label: "Suggested Order Qty", align: "end", csv: (i) => `${i.suggested_order_qty} ${i.unit}`, render: (i) => `${i.suggested_order_qty} ${i.unit}` },
  {
    key: "status",
    label: "Status",
    csv: (i) => (i.quantity_on_hand <= 0 ? "Out of Stock" : "Low"),
    render: (i) => i.quantity_on_hand <= 0
      ? <span className="badge bg-danger">Out of Stock</span>
      : <span className="badge bg-warning text-dark">Low</span>,
  },
];

function LowStockReportTab({ user }) {
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  const { columns, allColumns, isVisible, toggle, resetColumns } = useReportColumns("low-stock", LOW_STOCK_COLUMNS);

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data.categories)).catch(() => {});
    api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
  }, []);

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const departmentOptions = departments.map((d) => ({ value: String(d.id), label: d.name }));

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (categoryId) params.category_id = categoryId;
    if (departmentId) params.department_id = departmentId;
    api
      .get("/reports/low-stock", { params })
      .then((res) => {
        setItems(res.data.items);
        setSummary(res.data.summary);
        setError("");
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load low stock report."))
      .finally(() => setLoading(false));
  }, [q, categoryId, departmentId]);

  useEffect(load, [load]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(items, 10);

  const filtersSummary = useMemo(() => {
    const parts = [];
    if (categoryId) {
      const c = categories.find((c) => String(c.id) === String(categoryId));
      if (c) parts.push(`Category: ${c.name}`);
    }
    if (departmentId) {
      const d = departments.find((d) => String(d.id) === String(departmentId));
      if (d) parts.push(`Department: ${d.name}`);
    }
    if (q) parts.push(`Search: "${q}"`);
    return parts.length ? parts.join(" · ") : "All items at or below their reorder level";
  }, [categoryId, departmentId, q, categories, departments]);

  return (
    <>
      <Alert variant="info" className="py-2 small">
        <i className="bi bi-info-circle me-1" /> Suggested order quantity brings an item back up to double its reorder level — use it as a starting point, not a fixed purchase order.
      </Alert>
      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}

      {summary && (
        <Row>
          <StatCard label="Needing Reorder" value={summary.totalLowStock} warn={summary.totalLowStock > 0} md={4} />
          <StatCard label="Out of Stock" value={summary.outOfStockCount} warn={summary.outOfStockCount > 0} md={4} />
          <StatCard label="Total Deficit (units)" value={summary.totalDeficitUnits} md={4} />
        </Row>
      )}

      <Card className="plasu-card p-3">
        <Toolbar
          search={q}
          onSearchChange={setQ}
          placeholder="Search by item name or code…"
          filters={
            <>
              <SearchableSelect
                size="sm"
                style={{ width: 160 }}
                placeholder="All Categories"
                value={categoryId}
                onChange={setCategoryId}
                options={categoryOptions}
              />
              <SearchableSelect
                size="sm"
                style={{ width: 160 }}
                placeholder="All Departments"
                value={departmentId}
                onChange={setDepartmentId}
                options={departmentOptions}
              />
            </>
          }
          actions={
            <>
              <ColumnsMenu allColumns={allColumns} isVisible={isVisible} toggle={toggle} resetColumns={resetColumns} />
              <ReportActions
                disabled={loading || items.length === 0}
                onPrint={() => setShowPrint(true)}
                csv={{ filename: "low-stock-report", columns, rows: items }}
                pdf={{
                  filename: "low-stock-report",
                  title: "Low Stock / Reorder Report",
                  filtersSummary,
                  generatedBy: user.name,
                  columns,
                  rows: items,
                  summaryLines: summary
                    ? [`Needing Reorder: ${summary.totalLowStock}`, `Out of Stock: ${summary.outOfStockCount}`, `Total Deficit: ${summary.totalDeficitUnits}`]
                    : [],
                  signatureLabels: ["Prepared By (Store Officer)", "Verified By (Head of Store)", "Approved For Purchase By (ICT Admin)"],
                }}
              />
            </>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead><ColumnHeadRow columns={columns} /></thead>
              <tbody>
                {pageRows.map((i) => <ColumnBodyRow key={i.id} rowKey={i.id} columns={columns} row={i} />)}
                {pageRows.length === 0 && (
                  <tr><td colSpan={columns.length} className="text-center text-muted">Nothing is currently below its reorder level. 🎉</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)}>
        {summary && (
          <LowStockReportPrint items={items} summary={summary} filtersSummary={filtersSummary} generatedBy={user.name} />
        )}
      </PrintOverlay>
    </>
  );
}

// ===========================================================================
// 3. Stock Movements (Receipts) — the receiving-side ledger, for reconciling
// what's come in against supplier deliveries and tracking clearance status.
// ===========================================================================
const STOCK_MOVEMENT_COLUMNS = [
  { key: "date", label: "Date", required: true, csv: (r) => formatDate(r.created_at), render: (r) => formatDate(r.created_at) },
  { key: "itemCode", label: "Item Code", csv: (r) => r.item_code, render: (r) => r.item_code },
  { key: "item", label: "Item", required: true, csv: (r) => r.item_name, render: (r) => r.item_name },
  { key: "category", label: "Category", csv: (r) => r.category_name || "Uncategorized", render: (r) => r.category_name || "—" },
  {
    key: "packaging",
    label: "Packaging",
    csv: (r) => (r.pack_qty ? `${r.pack_qty} × ${r.packaging_label}` : "—"),
    render: (r) => (r.pack_qty ? `${r.pack_qty} × ${r.packaging_label}` : "—"),
  },
  { key: "qty", label: "Qty Received", align: "end", csv: (r) => `${r.qty} ${r.unit}`, render: (r) => `${r.qty} ${r.unit}` },
  { key: "receivedBy", label: "Received By", csv: (r) => r.received_by_name || "—", render: (r) => r.received_by_name || "—" },
  {
    key: "clearance",
    label: "Clearance",
    csv: (r) => (r.clearance_status === "cleared" ? `Cleared (${r.clearance_ref_no})` : r.clearance_ref_no ? `Pending (${r.clearance_ref_no})` : "Not Submitted"),
    render: (r) => r.clearance_status === "cleared"
      ? <span className="badge bg-success">Cleared</span>
      : r.clearance_ref_no
        ? <span className="badge bg-warning text-dark">Pending</span>
        : <span className="badge bg-secondary">Not Submitted</span>,
  },
  { key: "remarks", label: "Remarks", csv: (r) => r.remarks || "", render: (r) => <span className="small text-muted">{r.remarks || "—"}</span> },
];

function StockMovementsReportTab({ user }) {
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [clearanceStatus, setClearanceStatus] = useState("");
  const [preset, setPreset] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  const { columns, allColumns, isVisible, toggle, resetColumns } = useReportColumns("stock-movements", STOCK_MOVEMENT_COLUMNS);

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data.categories)).catch(() => {});
  }, []);

  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));

  const load = useCallback(() => {
    setLoading(true);
    const range = presetToRange(preset, customFrom, customTo);
    const params = { ...range };
    if (q) params.q = q;
    if (categoryId) params.category_id = categoryId;
    if (clearanceStatus) params.clearance_status = clearanceStatus;
    api
      .get("/reports/stock-movements", { params })
      .then((res) => {
        setReceipts(res.data.receipts);
        setSummary(res.data.summary);
        setError("");
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load stock movements report."))
      .finally(() => setLoading(false));
  }, [q, categoryId, clearanceStatus, preset, customFrom, customTo]);

  useEffect(load, [load]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(receipts, 10);

  const filtersSummary = useMemo(() => {
    const parts = [presetLabel(preset)];
    if (categoryId) {
      const c = categories.find((c) => String(c.id) === String(categoryId));
      if (c) parts.push(`Category: ${c.name}`);
    }
    if (clearanceStatus) parts.push(`Clearance: ${clearanceStatus === "cleared" ? "Cleared" : "Uncleared"}`);
    if (q) parts.push(`Search: "${q}"`);
    return parts.join(" · ");
  }, [preset, categoryId, clearanceStatus, q, categories]);

  return (
    <>
      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}

      {summary && (
        <Row>
          <StatCard label="Total Receipts" value={summary.totalReceipts} md={3} />
          <StatCard label="Total Units Received" value={summary.totalUnitsReceived} md={3} />
          <StatCard label="Awaiting Clearance" value={summary.unclearedCount} warn={summary.unclearedCount > 0} md={3} />
          <StatCard label="Distinct Items Received" value={Object.keys(summary.byItem).length} md={3} />
        </Row>
      )}

      <Card className="plasu-card p-3">
        <Toolbar
          search={q}
          onSearchChange={setQ}
          placeholder="Search by item name, code or remarks…"
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
              <SearchableSelect
                size="sm"
                style={{ width: 170 }}
                placeholder="All Categories"
                value={categoryId}
                onChange={setCategoryId}
                options={categoryOptions}
              />
              <Form.Select size="sm" value={clearanceStatus} onChange={(e) => setClearanceStatus(e.target.value)} style={{ width: 160 }}>
                <option value="">Any Clearance Status</option>
                <option value="cleared">Cleared</option>
                <option value="uncleared">Uncleared</option>
              </Form.Select>
            </>
          }
          actions={
            <>
              <ColumnsMenu allColumns={allColumns} isVisible={isVisible} toggle={toggle} resetColumns={resetColumns} />
              <ReportActions
                disabled={loading || receipts.length === 0}
                onPrint={() => setShowPrint(true)}
                csv={{ filename: "stock-movements-report", columns, rows: receipts }}
                pdf={{
                  filename: "stock-movements-report",
                  title: "Stock Movements Report (Receipts)",
                  filtersSummary,
                  generatedBy: user.name,
                  columns,
                  rows: receipts,
                  summaryLines: summary
                    ? [`Total Receipts: ${summary.totalReceipts}`, `Total Units Received: ${summary.totalUnitsReceived}`, `Awaiting Clearance: ${summary.unclearedCount}`]
                    : [],
                  signatureLabels: ["Prepared By (Head of Store)", "Verified By (Internal Audit)"],
                }}
              />
            </>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead><ColumnHeadRow columns={columns} /></thead>
              <tbody>
                {pageRows.map((r) => <ColumnBodyRow key={r.id} rowKey={r.id} columns={columns} row={r} />)}
                {pageRows.length === 0 && (
                  <tr><td colSpan={columns.length} className="text-center text-muted">No stock receipts match the selected filters.</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)} defaultLandscape>
        {summary && (
          <StockMovementsReportPrint receipts={receipts} summary={summary} filtersSummary={filtersSummary} generatedBy={user.name} />
        )}
      </PrintOverlay>
    </>
  );
}

// ===========================================================================
// 4. Requisitions
// ===========================================================================
const REQUISITION_COLUMNS = [
  { key: "reqNo", label: "SRV No.", required: true, csv: (r) => r.req_no, render: (r) => r.req_no },
  { key: "department", label: "Department", csv: (r) => r.department_name_current || r.department, render: (r) => r.department_name_current || r.department },
  { key: "requestedBy", label: "Requested By", csv: (r) => r.hod_name, render: (r) => r.hod_name },
  { key: "purpose", label: "Purpose", csv: (r) => r.purpose, render: (r) => <span className="text-truncate d-inline-block" style={{ maxWidth: 220 }}>{r.purpose}</span> },
  {
    key: "items",
    label: "Items",
    csv: (r) => r.lines?.map((l) => `${l.item_name} (${l.qty_requested} ${l.unit})`).join("; "),
    render: (r) => <span className="small">{r.lines?.map((l) => `${l.item_name} (${l.qty_requested} ${l.unit})`).join(", ")}</span>,
  },
  { key: "status", label: "Status", csv: (r) => r.status, render: (r) => <StatusBadge status={r.status} plain /> },
  { key: "date", label: "Date", csv: (r) => formatDate(r.created_at), render: (r) => formatDate(r.created_at) },
  {
    key: "view",
    label: "Actions",
    screenOnly: true,
    required: true,
    render: (r) => <Link to={`/requisitions/${r.id}`} className="btn btn-sm btn-outline-secondary">View</Link>,
  },
];

function RequisitionsReportTab({ user }) {
  const canSeeAll = hasRole(user, ...FULL_ACCESS_ROLES);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [hods, setHods] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [hodId, setHodId] = useState("");
  const [preset, setPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  const { columns, allColumns, isVisible, toggle, resetColumns } = useReportColumns("requisitions", REQUISITION_COLUMNS);
  const exportColumns = useMemo(() => columns.filter((c) => !c.screenOnly), [columns]);

  useEffect(() => {
    api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
    api.get("/categories").then((res) => setCategories(res.data.categories)).catch(() => {});
    api.get("/categories/subcategories/all").then((res) => setSubcategories(res.data.subcategories)).catch(() => {});
    if (canSeeAll) {
      api.get("/users/hods").then((res) => setHods(res.data.users)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subsForCategory = subcategories.filter((s) => !categoryId || String(s.category_id) === String(categoryId));
  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const subcategoryOptions = subsForCategory.map((s) => ({ value: String(s.id), label: s.name }));
  const departmentOptions = departments.map((d) => ({ value: String(d.id), label: d.name }));
  const hodOptions = hods.map((h) => ({ value: String(h.id), label: h.name }));

  const load = useCallback(() => {
    setLoading(true);
    const range = presetToRange(preset, customFrom, customTo);
    const params = { ...range };
    if (q) params.q = q;
    if (status) params.status = status;
    if (categoryId) params.category_id = categoryId;
    if (subcategoryId) params.subcategory_id = subcategoryId;
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
  }, [q, status, categoryId, subcategoryId, departmentId, hodId, preset, customFrom, customTo, canSeeAll]);

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
    if (categoryId) {
      const c = categories.find((c) => String(c.id) === String(categoryId));
      if (c) parts.push(`Category: ${c.name}`);
    }
    if (subcategoryId) {
      const s = subcategories.find((s) => String(s.id) === String(subcategoryId));
      if (s) parts.push(`Subcategory: ${s.name}`);
    }
    if (q) parts.push(`Search: "${q}"`);
    return parts.join(" · ");
  }, [preset, status, categoryId, subcategoryId, departmentId, hodId, q, categories, subcategories, departments, hods, canSeeAll]);

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
              <Form.Select size="sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 160 }}>
                <option value="">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="recommended">Recommended</option>
                <option value="approved">Approved</option>
                <option value="issued">Issued</option>
                <option value="rejected">Rejected</option>
              </Form.Select>
              <SearchableSelect
                size="sm"
                style={{ width: 160 }}
                placeholder="All Categories"
                value={categoryId}
                onChange={(v) => { setCategoryId(v); setSubcategoryId(""); }}
                options={categoryOptions}
              />
              <SearchableSelect
                size="sm"
                style={{ width: 160 }}
                placeholder="All Subcategories"
                value={subcategoryId}
                onChange={setSubcategoryId}
                options={subcategoryOptions}
              />
              {canSeeAll && (
                <>
                  <SearchableSelect
                    size="sm"
                    style={{ width: 170 }}
                    placeholder="All Departments"
                    value={departmentId}
                    onChange={setDepartmentId}
                    options={departmentOptions}
                  />
                  <SearchableSelect
                    size="sm"
                    style={{ width: 170 }}
                    placeholder="All Requesters"
                    value={hodId}
                    onChange={setHodId}
                    options={hodOptions}
                  />
                </>
              )}
            </>
          }
          actions={
            <>
              <ColumnsMenu allColumns={allColumns} isVisible={isVisible} toggle={toggle} resetColumns={resetColumns} />
              <ReportActions
                disabled={loading || rows.length === 0}
                onPrint={() => setShowPrint(true)}
                csv={{ filename: "requisitions-report", columns: exportColumns, rows }}
                pdf={{
                  filename: "requisitions-report",
                  title: "Requisitions Report",
                  filtersSummary,
                  generatedBy: user.name,
                  columns: exportColumns,
                  rows,
                  summaryLines: summary
                    ? [
                        `Total: ${summary.totalCount}`,
                        ...Object.entries(summary.byStatus).map(([k, v]) => `${k}: ${v}`),
                      ]
                    : [],
                  signatureLabels: ["Prepared By (Head of Store)", "Verified By (Issuance Officer)", "Approved By (Registrar/ICT Admin)"],
                }}
              />
            </>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead><ColumnHeadRow columns={columns} /></thead>
              <tbody>
                {pageRows.map((r) => <ColumnBodyRow key={r.id} rowKey={r.id} columns={columns} row={r} />)}
                {pageRows.length === 0 && (
                  <tr><td colSpan={columns.length} className="text-center text-muted">No requisitions match the selected filters.</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)} defaultLandscape>
        {summary && (
          <RequisitionsReportPrint requisitions={rows} summary={summary} filtersSummary={filtersSummary} generatedBy={user.name} />
        )}
      </PrintOverlay>
    </>
  );
}

// ===========================================================================
// 5. Department Summary — cross-department comparison (or, for a HOD, their
// own department's activity) of requisition volume and items issued.
// ===========================================================================
const DEPARTMENT_SUMMARY_COLUMNS = [
  { key: "department", label: "Department", required: true, csv: (d) => d.department_name, render: (d) => d.department_name },
  { key: "total", label: "Total", align: "end", csv: (d) => d.totalRequisitions, render: (d) => d.totalRequisitions },
  { key: "pending", label: "Pending", align: "end", csv: (d) => d.byStatus.pending || 0, render: (d) => d.byStatus.pending || 0 },
  { key: "recommended", label: "Recommended", align: "end", csv: (d) => d.byStatus.recommended || 0, render: (d) => d.byStatus.recommended || 0 },
  { key: "approved", label: "Approved", align: "end", csv: (d) => d.byStatus.approved || 0, render: (d) => d.byStatus.approved || 0 },
  { key: "issued", label: "Issued", align: "end", csv: (d) => d.byStatus.issued || 0, render: (d) => d.byStatus.issued || 0 },
  { key: "rejected", label: "Rejected", align: "end", csv: (d) => d.byStatus.rejected || 0, render: (d) => d.byStatus.rejected || 0 },
  { key: "unitsIssued", label: "Units Issued", align: "end", csv: (d) => d.totalUnitsIssued, render: (d) => d.totalUnitsIssued },
  {
    key: "topItems",
    label: "Top Items Issued",
    csv: (d) => d.topItems.map((t) => `${t.item_name} (${t.qty})`).join("; "),
    render: (d) => <span className="small">{d.topItems.map((t) => `${t.item_name} (${t.qty})`).join(", ") || "—"}</span>,
  },
];

function DepartmentSummaryReportTab({ user }) {
  // Mirrors the server's /reports/department-summary scoping rule: an HOD
  // who holds no broader role is locked to their own department.
  const canCompare = !(hasRole(user, "hod") && !hasRole(user, ...FULL_ACCESS_ROLES));
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [preset, setPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  const { columns, allColumns, isVisible, toggle, resetColumns } = useReportColumns("department-summary", DEPARTMENT_SUMMARY_COLUMNS);

  useEffect(() => {
    if (canCompare) {
      api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
    }
  }, [canCompare]);

  const departmentOptions = departments.map((d) => ({ value: String(d.id), label: d.name }));

  const load = useCallback(() => {
    setLoading(true);
    const range = presetToRange(preset, customFrom, customTo);
    const params = { ...range };
    if (canCompare && departmentId) params.department_id = departmentId;
    api
      .get("/reports/department-summary", { params })
      .then((res) => {
        setData(res.data);
        setError("");
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load department summary report."))
      .finally(() => setLoading(false));
  }, [canCompare, departmentId, preset, customFrom, customTo]);

  useEffect(load, [load]);

  const rows = data?.departments || [];
  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(rows, 10);

  const filtersSummary = useMemo(() => {
    const parts = [presetLabel(preset)];
    if (canCompare && departmentId) {
      const d = departments.find((d) => String(d.id) === String(departmentId));
      if (d) parts.push(`Department: ${d.name}`);
    } else if (!canCompare) {
      parts.push("Your department");
    }
    return parts.join(" · ");
  }, [preset, departmentId, departments, canCompare]);

  return (
    <>
      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}

      {data && (
        <Row>
          <StatCard label="Departments" value={data.summary.totalDepartments} md={4} />
          <StatCard label="Total Requisitions" value={data.summary.totalRequisitions} md={4} />
          <StatCard label="Total Units Issued" value={data.summary.totalUnitsIssued} md={4} />
        </Row>
      )}

      <Card className="plasu-card p-3">
        <Toolbar
          hideSearch
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
              {canCompare && (
                <SearchableSelect
                  size="sm"
                  style={{ width: 200 }}
                  placeholder="All Departments (Compare)"
                  value={departmentId}
                  onChange={setDepartmentId}
                  options={departmentOptions}
                />
              )}
            </>
          }
          actions={
            <>
              <ColumnsMenu allColumns={allColumns} isVisible={isVisible} toggle={toggle} resetColumns={resetColumns} />
              <ReportActions
                disabled={loading || rows.length === 0}
                onPrint={() => setShowPrint(true)}
                csv={{ filename: "department-summary-report", columns, rows }}
                pdf={{
                  filename: "department-summary-report",
                  title: "Department Summary Report",
                  filtersSummary,
                  generatedBy: user.name,
                  columns,
                  rows,
                  summaryLines: data
                    ? [`Departments: ${data.summary.totalDepartments}`, `Total Requisitions: ${data.summary.totalRequisitions}`, `Units Issued: ${data.summary.totalUnitsIssued}`]
                    : [],
                  signatureLabels: ["Prepared By (Head of Store)", "Verified By (Internal Audit)", "Approved By (Registrar/ICT Admin)"],
                }}
              />
            </>
          }
        />
        {!canCompare && (
          <div className="small text-muted mb-2">
            <i className="bi bi-info-circle me-1" /> Showing your own department's activity. Admins, the Head of Store and Issuance Officer can compare across all departments.
          </div>
        )}

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead><ColumnHeadRow columns={columns} /></thead>
              <tbody>
                {pageRows.map((d) => <ColumnBodyRow key={d.department_id || d.department_name} rowKey={d.department_id || d.department_name} columns={columns} row={d} />)}
                {pageRows.length === 0 && (
                  <tr><td colSpan={columns.length} className="text-center text-muted">No requisitions match the selected filters.</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)} defaultLandscape>
        {data && (
          <DepartmentSummaryReportPrint
            departments={rows}
            summary={data.summary}
            detail={data.detail}
            filtersSummary={filtersSummary}
            generatedBy={user.name}
          />
        )}
      </PrintOverlay>
    </>
  );
}

// ===========================================================================
// 6. Requisition Clearance Status — process oversight for the two-party
// clearance sheet (Head of Store signs first, then the Issuance Officer).
// ===========================================================================
const SIGNOFF_ROLE_LABELS = { head_of_store: "Head of Store", issuance_officer: "Issuance Officer" };

function signCsv(s) {
  if (!s) return "—";
  return s.signed ? `Signed (${s.signed_by_name})` : "Pending";
}
function SignBadge({ s }) {
  if (!s) return <span className="text-muted small">—</span>;
  return s.signed
    ? <span className="badge bg-success" title={s.signed_at ? formatDateTime(s.signed_at) : ""}>✓ {s.signed_by_name}</span>
    : <span className="badge bg-warning text-dark">Pending</span>;
}

const SIGNOFF_COLUMNS = [
  { key: "reqNo", label: "SRV No.", required: true, csv: (r) => r.req_no, render: (r) => r.req_no },
  { key: "department", label: "Department", csv: (r) => r.department_name_current || r.department, render: (r) => r.department_name_current || r.department },
  { key: "approvedOn", label: "Approved On", csv: (r) => formatDate(r.approved_at), render: (r) => formatDate(r.approved_at) },
  ...SIGNOFF_ROLES.map((role) => ({
    key: role,
    label: SIGNOFF_ROLE_LABELS[role],
    csv: (r) => signCsv(r.signoffs[role]),
    render: (r) => <SignBadge s={r.signoffs[role]} />,
  })),
  {
    key: "status",
    label: "Clearance Status",
    csv: (r) => (r.fully_cleared ? "Fully Cleared" : `${r.pending_roles.length} Pending`),
    render: (r) => (r.fully_cleared
      ? <span className="badge bg-success">Fully Cleared</span>
      : <span className="badge bg-warning text-dark">{r.pending_roles.length} Pending</span>),
  },
  {
    key: "turnaround",
    label: "Turnaround (hrs)",
    align: "end",
    csv: (r) => (r.turnaround_hours !== null ? r.turnaround_hours.toFixed(1) : "—"),
    render: (r) => (r.turnaround_hours !== null ? r.turnaround_hours.toFixed(1) : "—"),
  },
];

function RequisitionSignoffReportTab({ user }) {
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [preset, setPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  const { columns, allColumns, isVisible, toggle, resetColumns } = useReportColumns("signoffs", SIGNOFF_COLUMNS);

  useEffect(() => {
    api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
  }, []);

  const departmentOptions = departments.map((d) => ({ value: String(d.id), label: d.name }));

  const load = useCallback(() => {
    setLoading(true);
    const range = presetToRange(preset, customFrom, customTo);
    const params = { ...range };
    if (departmentId) params.department_id = departmentId;
    if (onlyPending) params.only_pending = "1";
    api
      .get("/reports/signoffs", { params })
      .then((res) => {
        setRows(res.data.requisitions);
        setSummary(res.data.summary);
        setError("");
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load clearance status report."))
      .finally(() => setLoading(false));
  }, [departmentId, onlyPending, preset, customFrom, customTo]);

  useEffect(load, [load]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(rows, 10);

  const filtersSummary = useMemo(() => {
    const parts = [presetLabel(preset)];
    if (departmentId) {
      const d = departments.find((d) => String(d.id) === String(departmentId));
      if (d) parts.push(`Department: ${d.name}`);
    }
    if (onlyPending) parts.push("Pending clearance only");
    return parts.join(" · ");
  }, [preset, departmentId, departments, onlyPending]);

  return (
    <>
      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}

      {summary && (
        <Row>
          <StatCard label="Fully Cleared" value={summary.fullyCleared} md={3} />
          <StatCard label="Pending Clearance" value={summary.pendingCount} warn={summary.pendingCount > 0} md={3} />
          <StatCard
            label={`Pending as ${SIGNOFF_ROLE_LABELS[user.role] || "Signatory"}`}
            value={summary.pendingByRole[user.role] ?? "—"}
            warn={(summary.pendingByRole[user.role] || 0) > 0}
            md={3}
          />
          <StatCard
            label="Avg. Turnaround"
            value={summary.averageTurnaroundHours !== null ? `${summary.averageTurnaroundHours.toFixed(1)}h` : "—"}
            md={3}
          />
        </Row>
      )}

      <Card className="plasu-card p-3">
        <Toolbar
          hideSearch
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
              <SearchableSelect
                size="sm"
                style={{ width: 180 }}
                placeholder="All Departments"
                value={departmentId}
                onChange={setDepartmentId}
                options={departmentOptions}
              />
              <Form.Check
                type="switch"
                id="signoff-only-pending"
                label="Pending only"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
                className="ms-1"
              />
            </>
          }
          actions={
            <>
              <ColumnsMenu allColumns={allColumns} isVisible={isVisible} toggle={toggle} resetColumns={resetColumns} />
              <ReportActions
                disabled={loading || rows.length === 0}
                onPrint={() => setShowPrint(true)}
                csv={{ filename: "requisition-clearance-report", columns, rows }}
                pdf={{
                  filename: "requisition-clearance-report",
                  title: "Requisition Clearance Status Report",
                  filtersSummary,
                  generatedBy: user.name,
                  columns,
                  rows,
                  summaryLines: summary
                    ? [`Fully Cleared: ${summary.fullyCleared}`, `Pending: ${summary.pendingCount}`]
                    : [],
                  signatureLabels: ["Compiled By (Head of Store)", "Reviewed By (Internal Audit)"],
                }}
              />
            </>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead><ColumnHeadRow columns={columns} /></thead>
              <tbody>
                {pageRows.map((r) => <ColumnBodyRow key={r.id} rowKey={r.id} columns={columns} row={r} />)}
                {pageRows.length === 0 && (
                  <tr><td colSpan={columns.length} className="text-center text-muted">No approved/issued requisitions match the selected filters.</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)} defaultLandscape>
        {summary && (
          <RequisitionSignoffReportPrint requisitions={rows} summary={summary} filtersSummary={filtersSummary} generatedBy={user.name} />
        )}
      </PrintOverlay>
    </>
  );
}

// ===========================================================================
// 7. Stock Clearance Status — batch-level oversight for clearance_requests,
// the date-range bundles of stock receipts the Head of Store submits for the
// Technical Expert / Audit Officer / Asset Officer to clear.
// ===========================================================================
const CLEARANCE_ROLE_LABELS = { technical_expert: "Technical Expert", audit_officer: "Audit Officer", asset_officer: "Asset Officer" };

function StockClearCell({ s }) {
  if (!s) return <span className="text-muted small">—</span>;
  return s.signed
    ? <span className="badge bg-success" title={s.signed_at ? formatDateTime(s.signed_at) : ""}>✓ {s.signed_by_name}</span>
    : <span className="badge bg-warning text-dark">Pending</span>;
}

const STOCK_CLEARANCE_COLUMNS = [
  { key: "refNo", label: "Ref No.", required: true, csv: (c) => c.ref_no, render: (c) => c.ref_no },
  { key: "period", label: "Period", csv: (c) => `${formatDate(c.date_from)} – ${formatDate(c.date_to)}`, render: (c) => `${formatDate(c.date_from)} – ${formatDate(c.date_to)}` },
  { key: "submittedBy", label: "Submitted By", csv: (c) => c.created_by_name, render: (c) => c.created_by_name },
  { key: "receiptCount", label: "Receipts", align: "end", csv: (c) => c.receipt_count, render: (c) => c.receipt_count },
  { key: "totalQty", label: "Total Qty", align: "end", csv: (c) => c.total_qty, render: (c) => c.total_qty },
  ...CLEARANCE_ROLES.map((role) => ({
    key: role,
    label: CLEARANCE_ROLE_LABELS[role],
    csv: (c) => signCsv(c.signoffs[role]),
    render: (c) => <StockClearCell s={c.signoffs[role]} />,
  })),
  {
    key: "status",
    label: "Status",
    csv: (c) => (c.fully_cleared ? "Cleared" : `${c.pending_roles.length} Pending`),
    render: (c) => (c.fully_cleared
      ? <span className="badge bg-success">Cleared</span>
      : <span className="badge bg-warning text-dark">{c.pending_roles.length} Pending</span>),
  },
  {
    key: "turnaround",
    label: "Turnaround (hrs)",
    align: "end",
    csv: (c) => (c.turnaround_hours !== null ? c.turnaround_hours.toFixed(1) : "—"),
    render: (c) => (c.turnaround_hours !== null ? c.turnaround_hours.toFixed(1) : "—"),
  },
];

function StockClearanceReportTab({ user }) {
  const [status, setStatus] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [preset, setPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);

  const { columns, allColumns, isVisible, toggle, resetColumns } = useReportColumns("stock-clearance", STOCK_CLEARANCE_COLUMNS);

  const load = useCallback(() => {
    setLoading(true);
    const range = presetToRange(preset, customFrom, customTo);
    const params = { ...range };
    if (status) params.status = status;
    if (onlyPending) params.only_pending = "1";
    api
      .get("/reports/stock-clearance", { params })
      .then((res) => {
        setRows(res.data.clearance_requests);
        setSummary(res.data.summary);
        setError("");
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load stock clearance report."))
      .finally(() => setLoading(false));
  }, [status, onlyPending, preset, customFrom, customTo]);

  useEffect(load, [load]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(rows, 10);

  const filtersSummary = useMemo(() => {
    const parts = [presetLabel(preset)];
    if (status) parts.push(`Status: ${status}`);
    if (onlyPending) parts.push("Pending clearance only");
    return parts.join(" · ");
  }, [preset, status, onlyPending]);

  return (
    <>
      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}

      {summary && (
        <Row>
          <StatCard label="Cleared" value={summary.fullyCleared} md={3} />
          <StatCard label="Pending" value={summary.pendingCount} warn={summary.pendingCount > 0} md={3} />
          <StatCard
            label={`Pending as ${CLEARANCE_ROLE_LABELS[user.role] || "Officer"}`}
            value={summary.pendingByRole[user.role] ?? "—"}
            warn={(summary.pendingByRole[user.role] || 0) > 0}
            md={3}
          />
          <StatCard
            label="Avg. Turnaround"
            value={summary.averageTurnaroundHours !== null ? `${summary.averageTurnaroundHours.toFixed(1)}h` : "—"}
            md={3}
          />
        </Row>
      )}

      <Card className="plasu-card p-3">
        <Toolbar
          hideSearch
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
                <option value="cleared">Cleared</option>
              </Form.Select>
              <Form.Check
                type="switch"
                id="clearance-only-pending"
                label="Pending only"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
                className="ms-1"
              />
            </>
          }
          actions={
            <>
              <ColumnsMenu allColumns={allColumns} isVisible={isVisible} toggle={toggle} resetColumns={resetColumns} />
              <ReportActions
                disabled={loading || rows.length === 0}
                onPrint={() => setShowPrint(true)}
                csv={{ filename: "stock-clearance-report", columns, rows }}
                pdf={{
                  filename: "stock-clearance-report",
                  title: "Stock Receipt Clearance Status Report",
                  filtersSummary,
                  generatedBy: user.name,
                  columns,
                  rows,
                  summaryLines: summary
                    ? [`Cleared: ${summary.fullyCleared}`, `Pending: ${summary.pendingCount}`]
                    : [],
                  signatureLabels: ["Compiled By (Head of Store)", "Reviewed By (Internal Audit)"],
                }}
              />
            </>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
              <thead><ColumnHeadRow columns={columns} /></thead>
              <tbody>
                {pageRows.map((c) => <ColumnBodyRow key={c.id} rowKey={c.id} columns={columns} row={c} />)}
                {pageRows.length === 0 && (
                  <tr><td colSpan={columns.length} className="text-center text-muted">No clearance requests match the selected filters.</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      <PrintOverlay show={showPrint} onClose={() => setShowPrint(false)} defaultLandscape>
        {summary && (
          <StockClearanceReportPrint clearanceRequests={rows} summary={summary} filtersSummary={filtersSummary} generatedBy={user.name} />
        )}
      </PrintOverlay>
    </>
  );
}

// ===========================================================================
// Reports page shell — tabs are shown per-role so every account type lands on
// a report set that's actually meaningful to them (a HOD doesn't need the
// stock-receiving ledger; a clearance officer cares about movements + their
// own clearance queue; admins and the Head of Store/Issuance Officer get the
// full operational picture).
// ===========================================================================
export default function Reports() {
  const { user } = useAuth();
  const [tab, setTab] = useState("inventory");

  const showStockMovements = hasRole(user, ...STOCK_MOVEMENT_ROLES);
  const showRequisitionSignoffs = hasRole(user, ...FULL_ACCESS_ROLES);
  const showStockClearance = hasRole(user, ...STOCK_CLEARANCE_VIEW_ROLES);

  return (
    <>
      <div className="mb-3">
        <h4 className="mb-0">Reports</h4>
        <p className="text-muted mb-0">
          Filter, customize, print and export official reports with the institution letterhead and watermark.
        </p>
      </div>

      <Tabs activeKey={tab} onSelect={setTab} className="mb-3 plasu-tabs">
        <Tab eventKey="inventory" title={<><i className="bi bi-box-seam me-1" />Inventory Status</>}>
          <InventoryReportTab user={user} />
        </Tab>
        <Tab eventKey="low-stock" title={<><i className="bi bi-exclamation-triangle me-1" />Low Stock</>}>
          <LowStockReportTab user={user} />
        </Tab>
        {showStockMovements && (
          <Tab eventKey="stock-movements" title={<><i className="bi bi-truck me-1" />Stock Movements</>}>
            <StockMovementsReportTab user={user} />
          </Tab>
        )}
        <Tab eventKey="requisitions" title={<><i className="bi bi-file-earmark-text me-1" />Requisitions</>}>
          <RequisitionsReportTab user={user} />
        </Tab>
        <Tab eventKey="departments" title={<><i className="bi bi-building me-1" />Department Summary</>}>
          <DepartmentSummaryReportTab user={user} />
        </Tab>
        {showRequisitionSignoffs && (
          <Tab eventKey="req-clearance" title={<><i className="bi bi-patch-check me-1" />Requisition Clearance</>}>
            <RequisitionSignoffReportTab user={user} />
          </Tab>
        )}
        {showStockClearance && (
          <Tab eventKey="stock-clearance" title={<><i className="bi bi-shield-check me-1" />Stock Clearance</>}>
            <StockClearanceReportTab user={user} />
          </Tab>
        )}
      </Tabs>
    </>
  );
}
