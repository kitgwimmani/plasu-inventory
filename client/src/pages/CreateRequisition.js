import React, { useEffect, useState, useMemo } from "react";
import { Card, Form, Button, Alert, Table, Row, Col, ButtonGroup, Badge } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

const EMPTY_ADHOC = {
  adhoc_name: "",
  adhoc_description: "",
  adhoc_unit: "piece",
  adhoc_category_id: "",
  adhoc_subcategory_id: "",
  adhoc_department_id: "",
  qty: "",
};

export default function CreateRequisition() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [purpose, setPurpose] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState("inventory"); // "inventory" | "new"
  const [selectedItem, setSelectedItem] = useState("");
  const [selectedPackaging, setSelectedPackaging] = useState("");
  const [packQty, setPackQty] = useState("");
  const [adhoc, setAdhoc] = useState(EMPTY_ADHOC);

  useEffect(() => {
    api.get("/items").then((res) => setItems(res.data.items));
    api.get("/categories").then((res) => setCategories(res.data.categories)).catch(() => {});
    api.get("/categories/subcategories/all").then((res) => setSubcategories(res.data.subcategories)).catch(() => {});
    api.get("/departments").then((res) => setDepartments(res.data.departments)).catch(() => {});
  }, []);

  const currentItem = useMemo(() => items.find((i) => i.id === Number(selectedItem)), [items, selectedItem]);
  const currentPackaging = useMemo(
    () => currentItem?.packagings.find((p) => p.id === Number(selectedPackaging)),
    [currentItem, selectedPackaging]
  );
  const baseQtyPreview = currentPackaging && packQty ? Number(packQty) * currentPackaging.units_per_pack : 0;
  const subsForCategory = (catId) =>
    subcategories.filter((s) => !catId || String(s.category_id) === String(catId));

  const handleSelectItem = (id) => {
    setSelectedItem(id);
    const item = items.find((i) => i.id === Number(id));
    const def = item?.default_packaging || item?.packagings[0];
    setSelectedPackaging(def ? String(def.id) : "");
    setPackQty("");
  };

  const addInventoryLine = () => {
    setError("");
    if (!selectedItem || !selectedPackaging || !packQty || Number(packQty) <= 0) {
      setError("Choose an item, a packaging, and enter a valid quantity.");
      return;
    }
    const item = items.find((i) => i.id === Number(selectedItem));
    const packaging = item.packagings.find((p) => p.id === Number(selectedPackaging));
    const baseQty = Number(packQty) * packaging.units_per_pack;
    if (baseQty > item.quantity_on_hand) {
      setError(`Requested quantity exceeds available stock (${item.quantity_on_hand} ${item.unit} on hand).`);
      return;
    }
    if (lines.find((l) => !l.is_adhoc && l.item_id === item.id)) {
      setError("That item is already on this requisition. Remove it first to change the quantity.");
      return;
    }
    setLines([
      ...lines,
      {
        is_adhoc: false,
        item_id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        packaging_id: packaging.id,
        packaging_label: packaging.label,
        pack_qty: Number(packQty),
        baseQty,
      },
    ]);
    setSelectedItem("");
    setSelectedPackaging("");
    setPackQty("");
  };

  const addAdhocLine = () => {
    setError("");
    if (!adhoc.adhoc_name.trim() || !adhoc.adhoc_unit.trim() || !adhoc.qty || Number(adhoc.qty) <= 0) {
      setError("A new item needs a name, a base unit and a quantity greater than zero.");
      return;
    }
    setLines([
      ...lines,
      {
        is_adhoc: true,
        name: adhoc.adhoc_name.trim(),
        unit: adhoc.adhoc_unit.trim(),
        description: adhoc.adhoc_description.trim(),
        adhoc_category_id: adhoc.adhoc_category_id || null,
        adhoc_subcategory_id: adhoc.adhoc_subcategory_id || null,
        adhoc_department_id: adhoc.adhoc_department_id || null,
        baseQty: Number(adhoc.qty),
        qty: Number(adhoc.qty),
      },
    ]);
    setAdhoc(EMPTY_ADHOC);
  };

  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!purpose.trim()) {
      setError("Please state the purpose of this requisition.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one item to the requisition.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/requisitions", {
        purpose,
        department_id: departmentId || null,
        items: lines.map((l) =>
          l.is_adhoc
            ? {
                is_adhoc: true,
                adhoc_name: l.name,
                adhoc_description: l.description,
                adhoc_unit: l.unit,
                adhoc_category_id: l.adhoc_category_id,
                adhoc_subcategory_id: l.adhoc_subcategory_id,
                adhoc_department_id: l.adhoc_department_id,
                qty: l.qty,
              }
            : { item_id: l.item_id, packaging_id: l.packaging_id, pack_qty: l.pack_qty }
        ),
      });
      navigate(`/requisitions/${res.data.requisition.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || "Could not submit requisition.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h4>New Requisition</h4>
      <p className="text-muted">
        Request items from available inventory, or describe an item the store does not yet carry —
        approved new items are added to inventory automatically. It is sent to the Head of Store for review.
      </p>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="plasu-card p-3 mb-3">
        <Row>
          <Col md={8} className="mb-3">
            <Form.Label>Purpose of Request</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Office stationery for departmental use, 2nd semester"
            />
          </Col>
          <Col md={4} className="mb-3">
            <Form.Label>Department</Form.Label>
            <Form.Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">-- My department --</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Form.Select>
          </Col>
        </Row>

        <ButtonGroup className="mb-3">
          <Button
            variant={mode === "inventory" ? "primary" : "outline-primary"}
            className={mode === "inventory" ? "btn-plasu" : ""}
            onClick={() => setMode("inventory")}
          >
            From Inventory
          </Button>
          <Button
            variant={mode === "new" ? "primary" : "outline-primary"}
            className={mode === "new" ? "btn-plasu" : ""}
            onClick={() => setMode("new")}
          >
            Request a New Item
          </Button>
        </ButtonGroup>

        {mode === "inventory" ? (
          <Row className="align-items-end g-2">
            <Col md={4}>
              <Form.Label>Item</Form.Label>
              <Form.Select value={selectedItem} onChange={(e) => handleSelectItem(e.target.value)}>
                <option value="">-- Select an item --</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id} disabled={i.quantity_on_hand <= 0}>
                    {i.code} — {i.name} ({i.quantity_on_hand} {i.unit} available)
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Label>Packaging</Form.Label>
              <Form.Select value={selectedPackaging} onChange={(e) => setSelectedPackaging(e.target.value)} disabled={!currentItem}>
                {currentItem?.packagings.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Label>Qty</Form.Label>
              <Form.Control type="number" min="1" value={packQty} onChange={(e) => setPackQty(e.target.value)} />
            </Col>
            <Col md={3}>
              <Button className="btn-plasu w-100" onClick={addInventoryLine} disabled={!currentItem}>Add Item</Button>
            </Col>
            {currentPackaging && packQty > 0 && (
              <Col md={12}>
                <div className="text-muted small mt-2">
                  = {baseQtyPreview} {currentItem.unit} ({currentPackaging.label} × {packQty})
                </div>
              </Col>
            )}
          </Row>
        ) : (
          <Row className="g-2">
            <Col md={5}>
              <Form.Label>Item Name</Form.Label>
              <Form.Control value={adhoc.adhoc_name} onChange={(e) => setAdhoc({ ...adhoc, adhoc_name: e.target.value })} placeholder="e.g. Desktop Stapler" />
            </Col>
            <Col md={3}>
              <Form.Label>Base Unit</Form.Label>
              <Form.Control value={adhoc.adhoc_unit} onChange={(e) => setAdhoc({ ...adhoc, adhoc_unit: e.target.value })} placeholder="piece" />
            </Col>
            <Col md={2}>
              <Form.Label>Qty</Form.Label>
              <Form.Control type="number" min="1" value={adhoc.qty} onChange={(e) => setAdhoc({ ...adhoc, qty: e.target.value })} />
            </Col>
            <Col md={2} className="d-flex align-items-end">
              <Button className="btn-plasu w-100" onClick={addAdhocLine}>Add Item</Button>
            </Col>
            <Col md={4}>
              <Form.Label>Category (optional)</Form.Label>
              <Form.Select
                value={adhoc.adhoc_category_id}
                onChange={(e) => setAdhoc({ ...adhoc, adhoc_category_id: e.target.value, adhoc_subcategory_id: "" })}
              >
                <option value="">-- None --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Label>Subcategory (optional)</Form.Label>
              <Form.Select
                value={adhoc.adhoc_subcategory_id}
                disabled={!adhoc.adhoc_category_id}
                onChange={(e) => setAdhoc({ ...adhoc, adhoc_subcategory_id: e.target.value })}
              >
                <option value="">-- None --</option>
                {subsForCategory(adhoc.adhoc_category_id).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Label>Department (optional)</Form.Label>
              <Form.Select value={adhoc.adhoc_department_id} onChange={(e) => setAdhoc({ ...adhoc, adhoc_department_id: e.target.value })}>
                <option value="">-- None --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={12}>
              <Form.Label>Description (optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={adhoc.adhoc_description}
                onChange={(e) => setAdhoc({ ...adhoc, adhoc_description: e.target.value })}
                placeholder="Describe the item so the store can source it"
              />
            </Col>
          </Row>
        )}
      </Card>

      <Card className="plasu-card p-3 mb-3">
        <h6>Requested Items</h6>
        <Table size="sm" className="table-plasu mb-0">
          <thead><tr><th>Item</th><th>Type</th><th>Packaging / Unit</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={idx}>
                <td>{l.is_adhoc ? l.name : `${l.code} — ${l.name}`}</td>
                <td>{l.is_adhoc ? <Badge bg="info">New item</Badge> : <Badge bg="light" text="dark" className="border">Inventory</Badge>}</td>
                <td>{l.is_adhoc ? l.unit : `${l.pack_qty} × ${l.packaging_label}`}</td>
                <td>{l.baseQty} {l.unit}</td>
                <td><Button size="sm" variant="outline-danger" onClick={() => removeLine(idx)}>Remove</Button></td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted">No items added yet.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Button className="btn-plasu" onClick={handleSubmit} disabled={saving}>
        {saving ? "Submitting…" : "Submit Requisition"}
      </Button>
    </>
  );
}
