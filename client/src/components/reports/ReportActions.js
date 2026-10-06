import React from "react";
import { Button, ButtonGroup } from "react-bootstrap";
import { downloadCsv } from "../../utils/exportCsv";
import { downloadReportPdf } from "../../utils/exportPdf";

// The standard export/print action cluster for every report: Print (opens the
// letterhead print preview), Export CSV, Export PDF. `csv`/`pdf` are omitted
// to hide that button for a report that doesn't support it yet.
export default function ReportActions({ onPrint, csv, pdf, disabled }) {
  return (
    <ButtonGroup>
      {onPrint && (
        <Button size="sm" className="btn-plasu" onClick={onPrint} disabled={disabled} title="Open print preview">
          <i className="bi bi-printer me-1" /> Print
        </Button>
      )}
      {csv && (
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={disabled}
          title="Export as CSV (Excel-compatible)"
          onClick={() => downloadCsv(csv.filename, csv.columns, csv.rows)}
        >
          <i className="bi bi-filetype-csv me-1" /> CSV
        </Button>
      )}
      {pdf && (
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={disabled}
          title="Export as PDF"
          onClick={() => downloadReportPdf(pdf.filename, pdf)}
        >
          <i className="bi bi-filetype-pdf me-1" /> PDF
        </Button>
      )}
    </ButtonGroup>
  );
}
