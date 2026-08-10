import React from "react";
import { Form } from "react-bootstrap";

// Simple, dependency-free pagination control for client-side-paged tables.
export default function Pager({ page, setPage, pageSize, setPageSize, total }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="pager-bar">
      <div className="text-muted small">
        {total === 0 ? "No results" : `Showing ${start}–${end} of ${total}`}
      </div>
      <div className="d-flex align-items-center gap-2">
        <Form.Select
          size="sm"
          style={{ width: "auto" }}
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </Form.Select>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <i className="bi bi-chevron-left" />
        </button>
        <span className="small text-muted">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          <i className="bi bi-chevron-right" />
        </button>
      </div>
    </div>
  );
}
