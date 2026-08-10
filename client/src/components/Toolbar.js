import React from "react";
import { Form, InputGroup } from "react-bootstrap";

// A compact, reusable search+filter row used across every growable table
// (Inventory, Requisitions, Users, Departments, Categories, Audit Log).
// `filters` renders arbitrary filter controls (selects, date pickers, etc.)
// to the right of the search box; `actions` renders buttons at the far right.
export default function Toolbar({ search, onSearchChange, placeholder = "Search…", filters, actions }) {
  return (
    <div className="data-toolbar">
      <InputGroup className="toolbar-search">
        <InputGroup.Text><i className="bi bi-search" /></InputGroup.Text>
        <Form.Control
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
        />
        {search && (
          <InputGroup.Text
            role="button"
            onClick={() => onSearchChange("")}
            title="Clear search"
            className="toolbar-clear"
          >
            <i className="bi bi-x-lg" />
          </InputGroup.Text>
        )}
      </InputGroup>
      {filters && <div className="toolbar-filters">{filters}</div>}
      {actions && <div className="toolbar-actions">{actions}</div>}
    </div>
  );
}
