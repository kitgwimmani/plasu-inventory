import React, { useEffect, useState, useMemo } from "react";
import { Card, Table, Button, Modal, Form, Alert, Badge } from "react-bootstrap";
import api from "../api/axios";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .get("/departments", { params: { include_inactive: 1 } })
      .then((res) => setDepartments(res.data.departments))
      .catch((err) => setError(err?.response?.data?.error || "Could not load departments."));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return departments;
    return departments.filter(
      (d) => d.name.toLowerCase().includes(term) || (d.code || "").toLowerCase().includes(term)
    );
  }, [departments, q]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(filtered, 10);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setError("");
    setShowModal(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setName(d.name);
    setError("");
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.put(`/departments/${editing.id}`, { name });
        setSuccess(`Department "${name}" updated.`);
      } else {
        await api.post("/departments", { name });
        setSuccess(`Department "${name}" added.`);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not save department.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d) => {
    try {
      await api.put(`/departments/${d.id}`, { is_active: d.is_active ? 0 : 1 });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update department.");
    }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Departments</h4>
          <p className="text-muted mb-0">Manage the department list used across users and requisitions.</p>
        </div>
        <Button className="btn-plasu" onClick={openCreate}><i className="bi bi-plus-lg me-1" />New Department</Button>
      </div>

      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess("")} dismissible>{success}</Alert>}

      <Card className="plasu-card p-3">
        <Toolbar search={q} onSearchChange={setQ} placeholder="Search departments…" />
        <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Users</th>
              <th>Requisitions</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td><Badge bg="light" text="dark" className="border">{d.code}</Badge></td>
                <td>{d.user_count}</td>
                <td>{d.requisition_count}</td>
                <td>
                  <Badge bg={d.is_active ? "success" : "secondary"}>{d.is_active ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="text-end">
                  <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openEdit(d)}>
                    <i className="bi bi-pencil" />
                  </Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => toggleActive(d)}>
                    {d.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted">No departments found.</td></tr>
            )}
          </tbody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editing ? "Edit Department" : "New Department"}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSave}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group>
              <Form.Label>Department Name</Form.Label>
              <Form.Control required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Department of Physics" />
            </Form.Group>
            {editing && (
              <div className="text-muted small mt-2">Code: {editing.code} (auto-generated, not editable)</div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="btn-plasu" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
