import React from "react";
import { Badge } from "react-bootstrap";

export default function CategoryBadge({ name, code }) {
  if (!name) return <span className="text-muted small">Uncategorized</span>;
  return (
    <Badge
      bg="transparent"
      style={{ backgroundColor: "transparent", color: "#0f6b2c", border: "1px solid #0f6b2c", fontWeight: 600 }}
      title={name}
    >
      {code || name}
    </Badge>
  );
}
