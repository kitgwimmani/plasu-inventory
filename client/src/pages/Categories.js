import React, { useEffect, useState, useMemo } from "react";
import { Card, Table, Button, Modal, Form, Alert, Badge, Row, Col, Collapse } from "react-bootstrap";
import api from "../api/axios";
import { useAuth, hasRole } from "../context/AuthContext";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import CategoryBadge from "../components/CategoryBadge";

const EMPTY = { name: "", description: "" };

export default function Categories() {
  const { user } = useAuth();
  const canManageCategories = hasRole(user, "superadmin", "ictadmin");
  const canManageSubcategories = hasRole(user, "superadmin", "ictadmin", "head_of_store");

  const [categories, setCategories] = useState([]);
  const [subsByCat, setSubsByCat] = useState({});
  const [expanded, setExpanded] = useState({});
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // Subcategory modal
  const [subModal, setSubModal] = useState(null); // { category, editing }
  const [subForm, setSubForm] = useState(EMPTY);

  const load = () => {
    api
      .get("/categories", { params: { include_inactive: 1 } })
      .then((res) => setCategories(res.data.categories))
      .catch((err) => setError(err?.response?.data?.error || "Could not load categories."));
  };

  useEffect(load, []);

  const loadSubs = (categoryId) => {
    api
      .get(`/categories/${categoryId}/subcategories`, { params: { include_inactive: 1 } })
      .then((res) => setSubsByCat((m) => ({ ...m, [categoryId]: res.data.subcategories })))
      .catch(() => {});
  };

  const toggleExpand = (categoryId) => {
    setExpanded((e) => ({ ...e, [categoryId]: !e[categoryId] }));
    if (!subsByCat[categoryId]) loadSubs(categoryId);
  };

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

  const openSubCreate = (category) => {
    setSubModal({ category, editing: null });
    setSubForm(EMPTY);
    setError("");
  };
  const openSubEdit = (category, sub) => {
    setSubModal({ category, editing: sub });
    setSubForm({ name: sub.name, description: sub.description || "" });
    setError("");
  };

  const handleSaveSub = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (subModal.editing) {
        await api.put(`/categories/subcategories/${subModal.editing.id}`, subForm);
        setSuccess(`Subcategory "${subForm.name}" updated.`);
      } else {
        await api.post(`/categories/${subModal.category.id}/subcategories`, subForm);
        setSuccess(`Subcategory "${subForm.name}" added.`);
      }
      const catId = subModal.category.id;
      setSubModal(null);
      loadSubs(catId);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not save subcategory.");
    } finally {
      setSaving(false);
    }
  };

  const toggleSubActive = async (category, sub) => {
    try {
      await api.put(`/categories/subcategories/${sub.id}`, { is_active: sub.is_active ? 0 : 1 });
      loadSubs(category.id);
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update subcategory.");
    }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Item Categories</h4>
          <p className="text-muted mb-0">
            Categories organize inventory and set the item-code prefix (e.g. "STA-0004"). Expand a
            category to manage its subcategories.
          </p>
        </div>
        {canManageCategories && (
          <Button className="btn-plasu" onClick={openCreate}><i className="bi bi-plus-lg me-1" />New Category</Button>
        )}
      </div>

      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess("")} dismissible>{success}</Alert>}

      <Card className="plasu-card p-3">
        <Toolbar search={q} onSearchChange={setQ} placeholder="Search categories…" />
        <Table responsive hover size="sm" className="table-plasu mb-0 table-compact">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Code Prefix</th>
              <th>Description</th>
              <th>Items</th>
              <th>Subcats</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => (
              <React.Fragment key={c.id}>
                <tr>
                  <td>
                    <Button size="sm" variant="link" className="p-0" onClick={() => toggleExpand(c.id)}>
                      <i className={`bi bi-chevron-${expanded[c.id] ? "down" : "right"}`} />
                    </Button>
                  </td>
                  <td><CategoryBadge name={c.name} code={c.name} /></td>
                  <td><Badge bg="light" text="dark" className="border">{c.code}</Badge></td>
                  <td className="text-muted small">{c.description}</td>
                  <td>{c.item_count}</td>
                  <td>{c.subcategory_count}</td>
                  <td>
                    <Badge bg={c.is_active ? "success" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="text-end">
                    {canManageCategories && (
                      <>
                        <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openEdit(c)}>
                          <i className="bi bi-pencil" />
                        </Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => toggleActive(c)}>
                          {c.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
                <tr>
                  <td colSpan={8} className="p-0 border-0">
                    <Collapse in={!!expanded[c.id]}>
                      <div className="p-3 bg-light">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <strong>Subcategories of {c.name}</strong>
                          {canManageSubcategories && (
                            <Button size="sm" variant="outline-secondary" onClick={() => openSubCreate(c)}>
                              <i className="bi bi-plus-lg me-1" />Add Subcategory
                            </Button>
                          )}
                        </div>
                        <Table size="sm" className="table-plasu mb-0 bg-white">
                          <thead><tr><th>Name</th><th>Code</th><th>Description</th><th>Items</th><th>Status</th><th></th></tr></thead>
                          <tbody>
                            {(subsByCat[c.id] || []).map((s) => (
                              <tr key={s.id}>
                                <td>{s.name}</td>
                                <td><Badge bg="light" text="dark" className="border">{s.code}</Badge></td>
                                <td className="text-muted small">{s.description}</td>
                                <td>{s.item_count}</td>
                                <td><Badge bg={s.is_active ? "success" : "secondary"}>{s.is_active ? "Active" : "Inactive"}</Badge></td>
                                <td className="text-end">
                                  {canManageSubcategories && (
                                    <>
                                      <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openSubEdit(c, s)}>
                                        <i className="bi bi-pencil" />
                                      </Button>
                                      <Button size="sm" variant="outline-secondary" onClick={() => toggleSubActive(c, s)}>
                                        {s.is_active ? "Deactivate" : "Activate"}
                                      </Button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {(subsByCat[c.id] || []).length === 0 && (
                              <tr><td colSpan={6} className="text-center text-muted">No subcategories yet.</td></tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Collapse>
                  </td>
                </tr>
              </React.Fragment>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted">No categories found.</td></tr>
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

      <Modal show={!!subModal} onHide={() => setSubModal(null)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {subModal?.editing ? "Edit Subcategory" : "New Subcategory"}
            {subModal && <span className="text-muted"> — {subModal.category.name}</span>}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSaveSub}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Subcategory Name</Form.Label>
              <Form.Control required value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} placeholder="e.g. Pens & Markers" />
            </Form.Group>
            <Form.Group>
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={2} value={subForm.description} onChange={(e) => setSubForm({ ...subForm, description: e.target.value })} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setSubModal(null)}>Cancel</Button>
            <Button type="submit" className="btn-plasu" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
