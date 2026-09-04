import React from "react";
import { Table } from "react-bootstrap";
import Letterhead from "./Letterhead";
import SignatureBlock from "./SignatureBlock";
import { formatDate, formatDateTime } from "../../utils/formatDate";

const SIGNOFF_LABELS = {
  head_of_store: "Head of Store",
  issuance_officer: "Issuance Officer",
};

// A printable delivery/issue receipt for a single requisition — handed to the
// requester as proof of collection, with the full clearance trail and item
// breakdown (base units + the packaging it was actually measured out in).
export default function ReceiptView({ requisition }) {
  const r = requisition;
  return (
    <div className="print-page">
      <Letterhead
        title="Store Issue Receipt"
        subtitle={`Requisition ${r.req_no}`}
        meta={[
          { label: "SRV No.", value: r.req_no },
          { label: "Date Issued", value: r.issued_at ? formatDate(r.issued_at) : "—" },
          { label: "Printed", value: formatDateTime(new Date()) },
        ]}
      />

      <div className="row mb-3">
        <div className="col-6">
          <div><strong>Department:</strong> {r.department_name_current || r.department}</div>
          <div><strong>Requested By:</strong> {r.hod_name}</div>
        </div>
        <div className="col-6">
          <div><strong>Purpose:</strong> {r.purpose}</div>
          <div><strong>Issued By:</strong> {r.issued_by_name || "—"}</div>
        </div>
      </div>

      <Table bordered size="sm" className="mb-4">
        <thead>
          <tr>
            <th>Item Code</th>
            <th>Item</th>
            <th>Packaging Issued</th>
            <th className="text-end">Qty (Base Unit)</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.item_code}</td>
              <td>{l.item_name}</td>
              <td>{l.pack_qty ? `${l.pack_qty} × ${l.packaging_label}` : "—"}</td>
              <td className="text-end">{l.qty_requested} {l.unit}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <p className="text-muted small">
        This receipt confirms that the item(s) listed above were issued from the Central Store
        against the requisition referenced, following completion of the required clearance
        signatures (Head of Store, then Issuance Officer).
      </p>

      <SignatureBlock
        labels={[
          { label: "Requester / User (HOD)", filled: r.hod_name },
          ...["head_of_store", "issuance_officer"].map((role) => {
            const s = (r.signoffs || []).find((x) => x.role_label === role);
            return { label: SIGNOFF_LABELS[role], filled: s?.signed_by_name || "" };
          }),
          { label: "Issued By", filled: r.issued_by_name || "" },
        ]}
      />
    </div>
  );
}
