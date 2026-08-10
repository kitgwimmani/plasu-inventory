import React, { useEffect, useState } from "react";
import { Card, Table, Button, Modal, Form, Alert, Badge, Row, Col } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { ROLE_LABELS } from "../context/AuthContext";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";

const EMPTY_FORM = { name: "", email: "", password: "", role: "hod", department_id: "" };

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
    setForm({ name: u.name, email: u.email, password: "", role: u.role, department_id: u.department_id || "" });
    setError("");
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, {
          name: form.name,
          email: form.email,
          role: form.role,
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
              <th>Role</th>
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
                <td>{ROLE_LABELS[u.role] || u.role}</td>
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
              <Col md={6} className="mb-3">
                <Form.Label>Role</Form.Label>
                <Form.Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="hod">Head of Department</option>
                  <option value="inventoryadmin">Inventory Admin</option>
                  <option value="technical_expert">Technical Expert</option>
                  <option value="audit_officer">Audit Officer</option>
                  <option value="asset_officer">Asset / Insurance Officer</option>
                  <option value="ictadmin">ICT Admin</option>
                  <option value="superadmin">Super Admin</option>
                </Form.Select>
              </Col>
              <Col md={6} className="mb-3">
                <Form.Label>Department / Unit</Form.Label>
                <Form.Select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                  <option value="">-- None --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Form.Select>
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
