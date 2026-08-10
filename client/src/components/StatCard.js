import React from "react";
import { Card, Col } from "react-bootstrap";

export default function StatCard({ label, value, warn, md = 3 }) {
  return (
    <Col md={md} className="mb-3">
      <Card className={`plasu-stat-card ${warn ? "warn" : ""} h-100`}>
        <Card.Body>
          <div className="stat-value">{value}</div>
          <div className="text-muted small">{label}</div>
        </Card.Body>
      </Card>
    </Col>
  );
}
