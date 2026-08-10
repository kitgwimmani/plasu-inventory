import React, { useEffect, useState, useMemo } from "react";
import { Card, Form, Button, Alert, Table, Row, Col } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function CreateRequisition() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [purpose, setPurpose] = useState("");
  const [lines, setLines] = useState([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [selectedPackaging, setSelectedPackaging] = useState("");
  const [packQty, setPackQty] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/items").then((res) => setItems(res.data.items));
  }, []);

  const currentItem = useMemo(() => items.find((i) => i.id === Number(selectedItem)), [items, selectedItem]);
  const currentPackaging = useMemo(
    () => currentItem?.packagings.find((p) => p.id === Number(selectedPackaging)),
    [currentItem, selectedPackaging]
  );
  const baseQtyPreview = currentPackaging && packQty ? Number(packQty) * currentPackaging.units_per_pack : 0;

  const handleSelectItem = (id) => {
    setSelectedItem(id);
    const item = items.find((i) => i.id === Number(id));
    const def = item?.default_packaging || item?.packagings[0];
    setSelectedPackaging(def ? String(def.id) : "");
    setPackQty("");
  };

  const addLine = () => {
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
    if (lines.find((l) => l.item_id === item.id)) {
      setError("That item is already on this requisition. Remove it first to change the quantity.");
      return;
    }
    setLines([
      ...lines,
      {
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

  const removeLine = (item_id) => setLines(lines.filter((l) => l.item_id !== item_id));

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
        items: lines.map((l) => ({ item_id: l.item_id, packaging_id: l.packaging_id, pack_qty: l.pack_qty })),
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
      <p className="text-muted">Select items from available inventory, choosing the packaging you need (e.g. a pack of 12 vs a single piece). It will be sent to the Inventory Admin for approval.</p>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="plasu-card p-3 mb-3">
        <Form.Group className="mb-3">
          <Form.Label>Purpose of Request</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Office stationery for departmental use, 2nd semester"
          />
        </Form.Group>

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
            <Button className="btn-plasu w-100" onClick={addLine} disabled={!currentItem}>Add Item</Button>
          </Col>
        </Row>
        {currentPackaging && packQty > 0 && (
          <div className="text-muted small mt-2">
            = {baseQtyPreview} {currentItem.unit} ({currentPackaging.label} × {packQty})
          </div>
        )}
      </Card>

      <Card className="plasu-card p-3 mb-3">
        <h6>Requested Items</h6>
        <Table size="sm" className="table-plasu mb-0">
          <thead><tr><th>Code</th><th>Name</th><th>Packaging</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.item_id}>
                <td>{l.code}</td>
                <td>{l.name}</td>
                <td>{l.pack_qty} × {l.packaging_label}</td>
                <td>{l.baseQty} {l.unit}</td>
                <td>
                  <Button size="sm" variant="outline-danger" onClick={() => removeLine(l.item_id)}>Remove</Button>
                </td>
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
