import React from "react";
import { Table } from "react-bootstrap";
import Letterhead from "./Letterhead";
import SignatureBlock from "./SignatureBlock";
import { formatDate, formatDateTime } from "../../utils/formatDate";

const LABELS = {
  technical_expert: "Technical Expert",
  audit_officer: "Audit Officer",
  asset_officer: "Asset / Insurance Officer",
};

// Printable stock-receipt clearance certificate: the receipts bundled into the
// request plus the three officers' clearance signatures.
export default function ClearancePrint({ clearance, generatedBy }) {
  const c = clearance;
  return (
    <div className="print-page">
      <Letterhead
        title="Stock Receipt Clearance Certificate"
        subtitle={`Reference ${c.ref_no}`}
        meta={[
          { label: "Ref No.", value: c.ref_no },
          { label: "Period", value: `${formatDate(c.date_from)} – ${formatDate(c.date_to)}` },
          { label: "Printed", value: formatDateTime(new Date()) },
        ]}
      />

      <div className="row mb-3">
        <div className="col-6">
          <div><strong>Submitted By:</strong> {c.created_by_name}</div>
          <div><strong>Status:</strong> {c.status === "cleared" ? `Cleared ${c.cleared_at ? formatDate(c.cleared_at) : ""}` : "Pending"}</div>
        </div>
        <div className="col-6">
          <div><strong>Receipts:</strong> {c.receipt_count}</div>
          {c.remark ? <div><strong>Remark:</strong> {c.remark}</div> : null}
        </div>
      </div>

      <Table bordered size="sm" className="mb-4">
        <thead>
          <tr>
            <th>Date</th>
            <th>Item Code</th>
            <th>Item</th>
            <th>Packaging</th>
            <th className="text-end">Qty (Base Unit)</th>
            <th>Received By</th>
          </tr>
        </thead>
        <tbody>
          {c.receipts.map((r) => (
            <tr key={r.id}>
              <td>{formatDate(r.created_at)}</td>
              <td>{r.item_code}</td>
              <td>{r.item_name}</td>
              <td>{r.pack_qty ? `${r.pack_qty} × ${r.packaging_label}` : "—"}</td>
              <td className="text-end">{r.qty} {r.unit}</td>
              <td>{r.received_by_name || "—"}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <p className="text-muted small">
        The officers below certify that they have examined the stock receipts listed above and
        cleared them for the records of the Central Store.
      </p>

      <SignatureBlock
        labels={(c.signoffs || []).map((s) => ({
          label: LABELS[s.role_label] || s.role_label,
          filled: s.signed_by_name || "",
        }))}
      />
    </div>
  );
}
