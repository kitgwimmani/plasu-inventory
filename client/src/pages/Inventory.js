import React, { useEffect, useState, useMemo } from "react";
import { Card, Table, Button, Modal, Form, Alert, Badge, Row, Col, OverlayTrigger, Tooltip, Spinner } from "react-bootstrap";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Toolbar from "../components/Toolbar";
import Pager from "../components/Pager";
import usePagination from "../hooks/usePagination";
import CategoryBadge from "../components/CategoryBadge";

const EMPTY_ITEM = { name: "", description: "", unit: "piece", category_id: "", quantity_on_hand: 0, reorder_level: 0 };
const EMPTY_PACKAGING_ROW = () => ({ key: Math.random().toString(36).slice(2), label: "", units_per_pack: "" });

function BestFit({ item }) {
  const bestFit = item.breakdown?.parts?.length
    ? item.breakdown.parts.map((p) => `${p.count} × ${p.label}`).join(", ") +
      (item.breakdown.remainder ? ` + ${item.breakdown.remainder} ${item.unit}` : "")
    : `${item.quantity_on_hand} ${item.unit}`;
  return (
    <OverlayTrigger overlay={<Tooltip>Exact: {item.quantity_on_hand} {item.unit}</Tooltip>}>
      <span className="best-fit-qty">{bestFit}</span>
    </OverlayTrigger>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const canAddItems = user.role === "superadmin" || user.role === "ictadmin";
  const canReceiveStock = user.role === "inventoryadmin" || canAddItems;

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const [newPackagings, setNewPackagings] = useState([EMPTY_PACKAGING_ROW()]);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_ITEM);
  const [newTierLabel, setNewTierLabel] = useState("");
  const [newTierUnits, setNewTierUnits] = useState("");

  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receivePackagingId, setReceivePackagingId] = useState("");
  const [receivePackQty, setReceivePackQty] = useState("");
  const [receiveRemarks, setReceiveRemarks] = useState("");

  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (categoryId) params.category_id = categoryId;
    if (status) params.status = status;
    api
      .get("/items", { params })
      .then((res) => setItems(res.data.items))
      .catch((err) => setError(err?.response?.data?.error || "Could not load inventory."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [q, categoryId, status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data.categories)).catch(() => {});
  }, []);

  const { page, setPage, pageSize, setPageSize, pageRows, total } = usePagination(items, 10);

  const handleAddPackagingRow = () => setNewPackagings([...newPackagings, EMPTY_PACKAGING_ROW()]);
  const handleRemovePackagingRow = (key) => setNewPackagings(newPackagings.filter((p) => p.key !== key));
  const updatePackagingRow = (key, field, value) =>
    setNewPackagings(newPackagings.map((p) => (p.key === key ? { ...p, [field]: value } : p)));

  const handleAddItem = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const packagings = newPackagings
        .filter((p) => p.label && p.units_per_pack)
        .map((p, idx) => ({ label: p.label, units_per_pack: Number(p.units_per_pack), is_default: idx === 0 }));
      await api.post("/items", { ...newItem, packagings });
      setSuccess(`Item "${newItem.name}" added to inventory.`);
      setShowAdd(false);
      setNewItem(EMPTY_ITEM);
      setNewPackagings([EMPTY_PACKAGING_ROW()]);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not add item.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item) => {
    setEditTarget(item);
    setEditForm({
      name: item.name,
      description: item.description || "",
      unit: item.unit,
      category_id: item.category_id || "",
      reorder_level: item.reorder_level,
      is_active: item.is_active,
    });
    setNewTierLabel("");
    setNewTierUnits("");
    setError("");
  };

  const reloadEditTarget = async (id) => {
    const res = await api.get(`/items/${id}`);
    setEditTarget(res.data.item);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put(`/items/${editTarget.id}`, editForm);
      setSuccess(`Item "${editForm.name}" updated.`);
      setEditTarget(null);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update item.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddTier = async () => {
    if (!newTierLabel || !newTierUnits) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/items/${editTarget.id}/packagings`, {
        label: newTierLabel,
        units_per_pack: Number(newTierUnits),
      });
      setNewTierLabel("");
      setNewTierUnits("");
      await reloadEditTarget(editTarget.id);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not add packaging tier.");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultTier = async (pkgId) => {
    setSaving(true);
    try {
      await api.put(`/items/packagings/${pkgId}`, { is_default: true });
      await reloadEditTarget(editTarget.id);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update packaging tier.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTierActive = async (pkg) => {
    setSaving(true);
    try {
      await api.put(`/items/packagings/${pkg.id}`, { is_active: pkg.is_active ? 0 : 1 });
      await reloadEditTarget(editTarget.id);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update packaging tier.");
    } finally {
      setSaving(false);
    }
  };

  const openReceive = (item) => {
    setReceiveTarget(item);
    const def = item.default_packaging || item.packagings[0];
    setReceivePackagingId(def ? String(def.id) : "");
    setReceivePackQty("");
    setReceiveRemarks("");
    setError("");
  };

  const receivePackaging = useMemo(() => {
    if (!receiveTarget) return null;
    return receiveTarget.packagings.find((p) => String(p.id) === String(receivePackagingId));
  }, [receiveTarget, receivePackagingId]);

  const handleReceive = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/items/${receiveTarget.id}/receive`, {
        packaging_id: receivePackagingId,
        pack_qty: Number(receivePackQty),
        remarks: receiveRemarks,
      });
      setSuccess(`Stock received for "${receiveTarget.name}".`);
      setReceiveTarget(null);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not record stock receipt.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Inventory</h4>
          <p className="text-muted mb-0">
            Available store items{canAddItems ? " — add new items or " : ""}
            {canReceiveStock ? "record incoming stock." : "."}
          </p>
        </div>
        {canAddItems && (
          <Button className="btn-plasu" onClick={() => { setShowAdd(true); setError(""); }}>
            <i className="bi bi-plus-lg me-1" /> Add Item
          </Button>
        )}
      </div>

      {error && <Alert variant="danger" onClose={() => setError("")} dismissible>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess("")} dismissible>{success}</Alert>}

      <Card className="plasu-card p-3">
        <Toolbar
          search={q}
          onSearchChange={setQ}
          placeholder="Search by name, code or description…"
          filters={
            <>
              <Form.Select size="sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: 180 }}>
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Form.Select>
              <Form.Select size="sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 150 }}>
                <option value="">All Statuses</option>
                <option value="low">Low Stock</option>
                <option value="healthy">Healthy</option>
              </Form.Select>
            </>
          }
        />

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: "#0f6b2c" }} /></div>
        ) : (
          <>
            <Table responsive hover className="table-plasu mb-0 table-compact">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>On Hand</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((i) => (
                  <tr key={i.id}>
                    <td>{i.code}</td>
                    <td>{i.name}<div className="text-muted small">{i.description}</div></td>
                    <td><CategoryBadge name={i.category_name} code={i.category_code} /></td>
                    <td><BestFit item={i} /></td>
                    <td>{i.reorder_level} {i.unit}</td>
                    <td>
                      {i.quantity_on_hand <= i.reorder_level ? (
                        <Badge bg="warning" text="dark">Low Stock</Badge>
                      ) : (
                        <Badge bg="success">Healthy</Badge>
                      )}
                    </td>
                    <td className="text-end">
                      {canAddItems && (
                        <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openEdit(i)}>
                          <i className="bi bi-pencil" />
                        </Button>
                      )}
                      {canReceiveStock && (
                        <Button size="sm" variant="outline-secondary" onClick={() => openReceive(i)}>
                          <i className="bi bi-box-arrow-in-down me-1" />Receive
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted">No items match the selected filters.</td></tr>
                )}
              </tbody>
            </Table>
            <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} />
          </>
        )}
      </Card>

      {/* Add item modal */}
      <Modal show={showAdd} onHide={() => setShowAdd(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>Add Inventory Item</Modal.Title></Modal.Header>
        <Form onSubmit={handleAddItem}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Row>
              <Col md={6} className="mb-3">
                <Form.Label>Item Name</Form.Label>
                <Form.Control required value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
              </Col>
              <Col md={6} className="mb-3">
                <Form.Label>Category</Form.Label>
                <Form.Select required value={newItem.category_id} onChange={(e) => setNewItem({ ...newItem, category_id: e.target.value })}>
                  <option value="">-- Select category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </Form.Select>
                <Form.Text muted>Item code is generated automatically from the category, e.g. "STA-0004".</Form.Text>
              </Col>
              <Col md={12} className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control as="textarea" rows={2} value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
              </Col>
              <Col md={4} className="mb-3">
                <Form.Label>Base Unit</Form.Label>
                <Form.Control required value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} placeholder="e.g. piece, sheet, litre" />
                <Form.Text muted>The smallest indivisible unit — packaging tiers below convert to this.</Form.Text>
              </Col>
              <Col md={4} className="mb-3">
                <Form.Label>Opening Quantity ({newItem.unit || "base unit"})</Form.Label>
                <Form.Control type="number" min="0" value={newItem.quantity_on_hand} onChange={(e) => setNewItem({ ...newItem, quantity_on_hand: e.target.value })} />
              </Col>
              <Col md={4} className="mb-3">
                <Form.Label>Reorder Level ({newItem.unit || "base unit"})</Form.Label>
                <Form.Control type="number" min="0" value={newItem.reorder_level} onChange={(e) => setNewItem({ ...newItem, reorder_level: e.target.value })} />
              </Col>
            </Row>

            <hr />
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div>
                <strong>Packaging Tiers</strong>
                <div className="text-muted small">
                  e.g. a pack of 12 pencils is not the same as a pack of 24, or 1 single pencil — define
                  every way this item is measured out.
                </div>
              </div>
              <Button size="sm" variant="outline-secondary" onClick={handleAddPackagingRow}>
                <i className="bi bi-plus-lg me-1" />Add Tier
              </Button>
            </div>
            {newPackagings.map((p, idx) => (
              <Row key={p.key} className="align-items-center mb-2">
                <Col md={6}>
                  <Form.Control
                    placeholder={idx === 0 ? `e.g. Single ${newItem.unit || "unit"}` : "e.g. Pack of 12"}
                    value={p.label}
                    onChange={(e) => updatePackagingRow(p.key, "label", e.target.value)}
                  />
                </Col>
                <Col md={4}>
                  <Form.Control
                    type="number"
                    min="1"
                    placeholder={`${newItem.unit || "unit"}s per pack`}
                    value={p.units_per_pack}
                    onChange={(e) => updatePackagingRow(p.key, "units_per_pack", e.target.value)}
                  />
                </Col>
                <Col md={2}>
                  {idx === 0 ? (
                    <Badge bg="light" text="dark" className="border">Default</Badge>
                  ) : (
                    <Button size="sm" variant="outline-danger" onClick={() => handleRemovePackagingRow(p.key)}>
                      <i className="bi bi-trash" />
                    </Button>
                  )}
                </Col>
              </Row>
            ))}
            <div className="text-muted small">Leave blank to auto-create a single "1 {newItem.unit || "unit"}" packaging.</div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" className="btn-plasu" disabled={saving}>{saving ? "Saving…" : "Add Item"}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Edit item modal */}
      <Modal show={!!editTarget} onHide={() => setEditTarget(null)} size="lg">
        <Modal.Header closeButton><Modal.Title>Edit Item: {editTarget?.name}</Modal.Title></Modal.Header>
        {editTarget && (
          <>
            <Modal.Body>
              {error && <Alert variant="danger">{error}</Alert>}
              <Form onSubmit={handleSaveEdit}>
                <Row>
                  <Col md={6} className="mb-3">
                    <Form.Label>Item Name</Form.Label>
                    <Form.Control required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </Col>
                  <Col md={6} className="mb-3">
                    <Form.Label>Category</Form.Label>
                    <Form.Select value={editForm.category_id} onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={12} className="mb-3">
                    <Form.Label>Description</Form.Label>
                    <Form.Control as="textarea" rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                  </Col>
                  <Col md={4} className="mb-3">
                    <Form.Label>Base Unit</Form.Label>
                    <Form.Control required value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} />
                  </Col>
                  <Col md={4} className="mb-3">
                    <Form.Label>Reorder Level</Form.Label>
                    <Form.Control type="number" min="0" value={editForm.reorder_level} onChange={(e) => setEditForm({ ...editForm, reorder_level: e.target.value })} />
                  </Col>
                  <Col md={4} className="mb-3">
                    <Form.Label>Status</Form.Label>
                    <Form.Select value={editForm.is_active ? "1" : "0"} onChange={(e) => setEditForm({ ...editForm, is_active: Number(e.target.value) })}>
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </Form.Select>
                  </Col>
                </Row>
                <div className="d-flex justify-content-end">
                  <Button type="submit" size="sm" className="btn-plasu" disabled={saving}>
                    {saving ? "Saving…" : "Save Item Details"}
                  </Button>
                </div>
              </Form>

              <hr />
              <strong>Packaging Tiers</strong>
              <div className="text-muted small mb-2">
                Current on hand: {editTarget.quantity_on_hand} {editTarget.unit}
              </div>
              <Table size="sm" className="table-plasu mb-2">
                <thead><tr><th>Label</th><th className="text-end">Units / Pack</th><th>Default</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {editTarget.packagings.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td className="text-end">{p.units_per_pack} {editTarget.unit}</td>
                      <td>
                        {p.is_default ? (
                          <Badge bg="success">Default</Badge>
                        ) : (
                          <Button size="sm" variant="link" className="p-0" onClick={() => handleSetDefaultTier(p.id)}>Set default</Button>
                        )}
                      </td>
                      <td>
                        <Badge bg={p.is_active ? "success" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td>
                        <Button size="sm" variant="outline-secondary" onClick={() => handleToggleTierActive(p)}>
                          {p.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Row className="align-items-center">
                <Col md={5}>
                  <Form.Control size="sm" placeholder="e.g. Carton of 100" value={newTierLabel} onChange={(e) => setNewTierLabel(e.target.value)} />
                </Col>
                <Col md={4}>
                  <Form.Control size="sm" type="number" min="1" placeholder={`${editTarget.unit}s per pack`} value={newTierUnits} onChange={(e) => setNewTierUnits(e.target.value)} />
                </Col>
                <Col md={3}>
                  <Button size="sm" variant="outline-secondary" onClick={handleAddTier} disabled={saving || !newTierLabel || !newTierUnits}>
                    <i className="bi bi-plus-lg me-1" />Add Tier
                  </Button>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setEditTarget(null)}>Close</Button>
            </Modal.Footer>
          </>
        )}
      </Modal>

      {/* Receive stock modal */}
      <Modal show={!!receiveTarget} onHide={() => setReceiveTarget(null)}>
        <Modal.Header closeButton><Modal.Title>Receive Stock: {receiveTarget?.name}</Modal.Title></Modal.Header>
        <Form onSubmit={handleReceive}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Packaging Received</Form.Label>
              <Form.Select required value={receivePackagingId} onChange={(e) => setReceivePackagingId(e.target.value)}>
                {receiveTarget?.packagings.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.units_per_pack} {receiveTarget.unit} each)</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Number of {receivePackaging?.label || "packs"} Received</Form.Label>
              <Form.Control type="number" min="1" required value={receivePackQty} onChange={(e) => setReceivePackQty(e.target.value)} />
              {receivePackaging && receivePackQty > 0 && (
                <Form.Text muted>
                  = {Number(receivePackQty) * receivePackaging.units_per_pack} {receiveTarget.unit} added to stock.
                </Form.Text>
              )}
            </Form.Group>
            <Form.Group>
              <Form.Label>Remarks (optional)</Form.Label>
              <Form.Control as="textarea" rows={2} value={receiveRemarks} onChange={(e) => setReceiveRemarks(e.target.value)} placeholder="e.g. Supplier / delivery reference" />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setReceiveTarget(null)}>Cancel</Button>
            <Button type="submit" className="btn-plasu" disabled={saving}>{saving ? "Saving…" : "Confirm Receipt"}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
