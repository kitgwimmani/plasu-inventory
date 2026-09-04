import React, { useEffect, useState } from "react";
import { Card, Table, Button, Modal, Form, Alert, Badge, Row, Col } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { ROLE_LABELS } from "../context/AuthContext";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import SearchableSelect from "../components/SearchableSelect";

const EMPTY_FORM = { name: "", email: "", password: "", roles: ["hod"], department_id: "" };

// Order shown in the create/edit checkbox list.
const ROLE_ORDER = [
  "hod",
  "head_of_store",
  "issuance_officer",
  "technical_expert",
  "audit_officer",
  "asset_officer",
  "ictadmin",
  "superadmin",
];

export default function Users() {
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const load = () => {
    const params = {};
    if (q) params.q = q;
    if (roleFilter) params.role = roleFilter;
    if (statusFilter) params.status = statusFilter;
    api
      .get("/users", { params })
      .then((res) => setUsers(res.data.users))
      .catch((err) => setError(err?.response?.data?.error || "Could not load users."));
  };

  useEffect(load, [q, roleFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
  }, []);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(users, 10);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setSuccess("");
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      roles: u.roles && u.roles.length ? u.roles : [u.role],
      department_id: u.department_id || "",
    });
    setError("");
    setShowModal(true);
  };

  const toggleRole = (role) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.roles || form.roles.length === 0) {
      setError("Select at least one role.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, {
          name: form.name,
          email: form.email,
          roles: form.roles,
          department_id: form.department_id || null,
        });
        setSuccess(`User ${form.email} updated successfully.`);
      } else {
        await api.post("/users", form);
        setSuccess(`User ${form.email} created successfully.`);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not save user.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update user.");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { newPassword });
      setSuccess(`Password reset for ${resetTarget.email}.`);
      setResetTarget(null);
      setNewPassword("");
    } catch (err) {
      setError(err?.response?.data?.error || "Could not reset password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">User Management</h4>
          <p className="text-muted mb-0">Create and correct accounts. Email is the unique login ID and can be fixed here too.</p>
        </div>
        <Button className="btn-plasu" onClick={openCreate}><i className="bi bi-plus-lg me-1" />New User</Button>
      </div>

      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess("")} dismissible>{success}</Alert>}

      <Card className="plasu-card p-3">
        <Toolbar
          search={q}
          onSearchChange={setQ}
          placeholder="Search by name or email…"
          filters={
            <>
              <Form.Select size="sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 190 }}>
                <option value="">All Roles</option>
                {Object.entries(ROLE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </Form.Select>
              <Form.Select size="sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 150 }}>
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </Form.Select>
            </>
          }
        />
        <Table responsive hover className="table-plasu mb-0 table-compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Department</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  {(u.roles && u.roles.length ? u.roles : [u.role]).map((r) => (
                    <Badge key={r} bg="light" text="dark" className="border me-1 mb-1">
                      {ROLE_LABELS[r] || r}
                    </Badge>
                  ))}
                </td>
                <td>{u.department_name || u.department || "—"}</td>
                <td>
                  <Badge bg={u.is_active ? "success" : "secondary"}>
                    {u.is_active ? "Active" : "Deactivated"}
                  </Badge>
                </td>
                <td className="text-end">
                  <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openEdit(u)}>
                    <i className="bi bi-pencil" />
                  </Button>
                  <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => { setResetTarget(u); setNewPassword(""); setError(""); }}>
                    <i className="bi bi-key" />
                  </Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => toggleActive(u)}>
                    {u.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted">No users match the selected filters.</td></tr>
            )}
          </tbody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editing ? "Edit User" : "Create New User"}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSave}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Row>
              <Col md={12} className="mb-3">
                <Form.Label>Full Name</Form.Label>
                <Form.Control required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Col>
              <Col md={12} className="mb-3">
                <Form.Label>Email (login ID)</Form.Label>
                <Form.Control type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Col>
              {!editing && (
                <Col md={12} className="mb-3">
                  <Form.Label>Temporary Password</Form.Label>
                  <Form.Control type="text" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </Col>
              )}
              <Col md={12} className="mb-3">
                <Form.Label>Roles</Form.Label>
                <div className="d-flex flex-wrap gap-3 border rounded p-2">
                  {ROLE_ORDER.map((r) => (
                    <Form.Check
                      key={r}
                      type="checkbox"
                      id={`role-${r}`}
                      label={ROLE_LABELS[r] || r}
                      checked={form.roles.includes(r)}
                      onChange={() => toggleRole(r)}
                    />
                  ))}
                </div>
                <Form.Text muted>A user can hold several roles at once.</Form.Text>
              </Col>
              <Col md={6} className="mb-3">
                <Form.Label>Department / Unit</Form.Label>
                <SearchableSelect
                  placeholder="-- None --"
                  value={form.department_id}
                  onChange={(v) => setForm({ ...form, department_id: v })}
                  options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                />
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="btn-plasu" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create User"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!resetTarget} onHide={() => setResetTarget(null)}>
        <Modal.Header closeButton><Modal.Title>Reset Password: {resetTarget?.email}</Modal.Title></Modal.Header>
        <Form onSubmit={handleResetPassword}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group>
              <Form.Label>New Password</Form.Label>
              <Form.Control type="text" minLength={6} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button type="submit" className="btn-plasu" disabled={saving}>{saving ? "Saving…" : "Reset Password"}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
