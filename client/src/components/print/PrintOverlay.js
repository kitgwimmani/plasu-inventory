import React, { useEffect, useState } from "react";
import { Button, ButtonGroup } from "react-bootstrap";

// Full-viewport print preview: shows a "Print" / "Close" toolbar (hidden while
// actually printing via the .no-print class) around whatever printable content
// is passed as children. @media print rules in theme.css make sure only this
// overlay's content ends up on the printed page, not the rest of the app.
//
// Paper-friendly controls: a report can suggest a default orientation/density
// (e.g. a wide stock-movements table defaults to landscape) via
// `defaultLandscape` / `defaultCompact`, but the user can always flip either
// before printing — the choice is applied as a class on the overlay, which
// theme.css uses both for the on-screen preview width and (via the inherited
// CSS `page` property) the actual printed page orientation.
export default function PrintOverlay({ show, onClose, defaultLandscape = false, defaultCompact = false, children }) {
  const [landscape, setLandscape] = useState(defaultLandscape);
  const [compact, setCompact] = useState(defaultCompact);

  useEffect(() => {
    if (show) {
      setLandscape(defaultLandscape);
      setCompact(defaultCompact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  const overlayClass = ["print-overlay", landscape && "landscape", compact && "compact"].filter(Boolean).join(" ");

  return (
    <div className={overlayClass}>
      <div className="print-toolbar no-print">
        <div className="text-muted small">Print preview</div>
        <div className="d-flex align-items-center gap-2">
          <ButtonGroup size="sm">
            <Button
              variant={landscape ? "outline-secondary" : "secondary"}
              onClick={() => setLandscape(false)}
              title="Portrait orientation"
            >
              <i className="bi bi-file-earmark me-1" /> Portrait
            </Button>
            <Button
              variant={landscape ? "secondary" : "outline-secondary"}
              onClick={() => setLandscape(true)}
              title="Landscape orientation — better for wide tables"
            >
              <i className="bi bi-file-earmark-fill me-1" style={{ transform: "rotate(90deg)", display: "inline-block" }} /> Landscape
            </Button>
          </ButtonGroup>
          <Button
            size="sm"
            variant={compact ? "secondary" : "outline-secondary"}
            onClick={() => setCompact((v) => !v)}
            title="Compact density — fit more rows per page"
          >
            <i className="bi bi-arrows-collapse me-1" /> Compact
          </Button>
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
