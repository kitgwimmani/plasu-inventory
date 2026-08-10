import React from "react";

// Printed signature lines at the foot of a report or receipt (e.g. "Prepared
// By", "Verified By", "Approved By"), or the actual clearance sheet names for
// an issued requisition receipt.
export default function SignatureBlock({ labels }) {
  return (
    <div className="signature-block">
      {labels.map((l, i) => (
        <div className="signature-line" key={i}>
          <div className="sig-space">{typeof l === "object" ? l.filled || "" : ""}</div>
          <div className="sig-underline" />
          <div className="sig-label">{typeof l === "object" ? l.label : l}</div>
        </div>
      ))}
    </div>
  );
}
