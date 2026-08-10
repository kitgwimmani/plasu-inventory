import React from "react";
import { Badge } from "react-bootstrap";

const LABELS = {
  pending: "Pending Approval",
  approved: "Approved – Awaiting Signoff/Issue",
  issued: "Issued",
  rejected: "Rejected",
};

export default function StatusBadge({ status, plain }) {
  if (plain) {
    return (
      <Badge
        bg="transparent"
        style={{ backgroundColor: "transparent", color: "#0f6b2c", border: "1px solid #0f6b2c", fontWeight: 600 }}
      >
        {LABELS[status] || status}
      </Badge>
    );
  }
  return <Badge className={`badge-status-${status}`}>{LABELS[status] || status}</Badge>;
}
