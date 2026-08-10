import React, { useEffect, useState, useMemo } from "react";
import { Card, Table, Button, Modal, Form, Alert, Badge, Row, Col } from "react-bootstrap";
import api from "../api/axios";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import CategoryBadge from "../components/CategoryBadge";

const EMPTY = { name: "", description: "" };

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .get("/categories", { params: { include_inactive: 1 } })
      .then((res) => setCategories(res.data.categories))
      .catch((err) => setError(err?.response?.data?.error || "Could not load categories."));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return categories;
    return categories.filter(
      (c) => c.name.toLowerCase().includes(term) || (c.code || "").toLowerCase().includes(term)
    );
  }, [categories, q]);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(filtered, 10);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setShowModal(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description || "" });
    setError("");
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, form);
        setSuccess(`Category "${form.name}" updated.`);
      } else {
        await api.post("/categories", form);
        setSuccess(`Category "${form.name}" added.`);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not save category.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c) => {
    try {
      await api.put(`/categories/${c.id}`, { is_active: c.is_active ? 0 : 1 });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update category.");
    }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Item Categories</h4>
          <p className="text-muted mb-0">
            Categories organize inventory (e.g. Stationery, Furniture) and set the prefix used for
            auto-generated item codes (e.g. "STA-0004").
          </p>
        </div>
        <Button className="btn-plasu" onClick={openCreate}><i className="bi bi-plus-lg me-1" />New Category</Button>
      </div>

      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess("")} dismissible>{success}</Alert>}

      <Card className="plasu-card p-3">
        <Toolbar search={q} onSearchChange={setQ} placeholder="Search categories…" />
        <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code Prefix</th>
              <th>Description</th>
              <th>Items</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => (
              <tr key={c.id}>
                <td><CategoryBadge name={c.name} code={c.name} /></td>
                <td><Badge bg="light" text="dark" className="border">{c.code}</Badge></td>
                <td className="text-muted small">{c.description}</td>
                <td>{c.item_count}</td>
                <td>
                  <Badge bg={c.is_active ? "success" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="text-end">
                  <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openEdit(c)}>
                    <i className="bi bi-pencil" />
                  </Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => toggleActive(c)}>
                    {c.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted">No categories found.</td></tr>
            )}
          </tbody>
        </Table>
        <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editing ? "Edit Category" : "New Category"}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSave}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Row>
              <Col md={12} className="mb-3">
                <Form.Label>Category Name</Form.Label>
                <Form.Control required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cleaning Supplies" />
              </Col>
              <Col md={12} className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control as="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Col>
            </Row>
            {editing && (
              <div className="text-muted small">Code prefix: {editing.code} (auto-generated, not editable)</div>
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
