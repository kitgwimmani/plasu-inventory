import React from "react";
import { Dropdown, Form, Button } from "react-bootstrap";

// "Columns" picker shared by every customizable report table — lets a user
// show/hide fields to fit what they personally need (e.g. a HOD might hide
// the reorder level column; an auditor might want every column visible).
export default function ColumnsMenu({ allColumns, isVisible, toggle, resetColumns }) {
  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle size="sm" variant="outline-secondary" id="columns-menu-toggle">
        <i className="bi bi-layout-three-columns me-1" /> Columns
      </Dropdown.Toggle>
      <Dropdown.Menu className="p-2" style={{ minWidth: 230, maxHeight: 320, overflowY: "auto" }}>
        <div className="small text-muted mb-2">Show / hide columns</div>
        {allColumns.map((c) => (
          <Form.Check
            key={c.key}
            type="checkbox"
            id={`col-chk-${c.key}`}
            label={c.label}
            checked={isVisible(c.key)}
            disabled={c.required}
            onChange={() => toggle(c.key)}
            className="mb-1"
          />
        ))}
        <Dropdown.Divider />
        <Button size="sm" variant="link" className="p-0" onClick={resetColumns}>
          Reset to default
        </Button>
      </Dropdown.Menu>
    </Dropdown>
  );
}
