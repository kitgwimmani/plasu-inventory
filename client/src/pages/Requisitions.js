import React, { useEffect, useState, useCallback } from "react";
import { Card, Table, Button, Alert, Form } from "react-bootstrap";
import { Link } from "react-router-dom";
import api from "../api/axios";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import { presetToRange } from "../utils/dateRanges";

const FULL_ACCESS_ROLES = ["superadmin", "ictadmin", "inventoryadmin"];

export default function Requisitions() {
  const { user } = useAuth();
  const canSeeAll = FULL_ACCESS_ROLES.includes(user.role);
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [preset, setPreset] = useState("all");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const range = presetToRange(preset);
    const params = { ...range };
    if (q) params.q = q;
    if (status) params.status = status;
    if (canSeeAll && departmentId) params.department_id = departmentId;
    api
      .get("/requisitions", { params })
      .then((res) => setRows(res.data.requisitions))
      .catch((err) => setError(err?.response?.data?.error || "Could not load requisitions."));
  }, [q, status, departmentId, preset, canSeeAll]);

  useEffect(load, [load]);
  useEffect(() => {
    if (canSeeAll) {
      api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
    }
  }, [canSeeAll]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(rows, 10);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Requisitions</h4>
          <p className="text-muted mb-0">
            {user.role === "hod" ? "Your requisitions and their approval status." : "All requisitions raised across departments."}
          </p>
        </div>
        {user.role === "hod" && (
          <Button as={Link} to="/requisitions/new" className="btn-plasu"><i className="bi bi-plus-lg me-1" />New Requisition</Button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

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
              </Form.Select>
              <Form.Select size="sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 150 }}>
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="issued">Issued</option>
                <option value="rejected">Rejected</option>
              </Form.Select>
              {canSeeAll && (
                <Form.Select size="sm" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: 180 }}>
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Form.Select>
              )}
            </>
          }
          actions={
            <Button as={Link} to="/reports" size="sm" variant="outline-secondary">
              <i className="bi bi-printer me-1" />Print Reports
            </Button>
          }
        />
        <Table responsive hover className="table-plasu mb-0 table-compact">
          <thead>
            <tr>
              <th>SRV No.</th>
              <th>Department</th>
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
                <td className="text-truncate" style={{ maxWidth: 260 }}>{r.purpose}</td>
                <td><StatusBadge status={r.status} plain /></td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>
                  <Button as={Link} to={`/requisitions/${r.id}`} size="sm" className="btn-outline-plasu">
                    View
                  </Button>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted">No requisitions match the selected filters.</td></tr>
            )}
          </tbody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
      </Card>
    </>
  );
}
