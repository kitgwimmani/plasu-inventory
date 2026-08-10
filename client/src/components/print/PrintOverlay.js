import React from "react";
import { Button } from "react-bootstrap";

// Full-viewport print preview: shows a "Print" / "Close" toolbar (hidden while
// actually printing via the .no-print class) around whatever printable content
// is passed as children. @media print rules in theme.css make sure only this
// overlay's content ends up on the printed page, not the rest of the app.
export default function PrintOverlay({ show, onClose, children }) {
  if (!show) return null;
  return (
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <div className="text-muted small">Print preview</div>
        <div className="d-flex gap-2">
          <Button size="sm" className="btn-plasu" onClick={() => window.print()}>
            <i className="bi bi-printer me-1" /> Print
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={onClose}>
            <i className="bi bi-x-lg me-1" /> Close
          </Button>
        </div>
      </div>
      <div className="print-page-scroll">{children}</div>
    </div>
  );
}
