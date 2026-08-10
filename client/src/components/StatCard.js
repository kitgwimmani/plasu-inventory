import React from "react";
import { Card, Col } from "react-bootstrap";
import { Link } from "react-router-dom";

export default function StatCard({ label, value, warn, md = 3, to }) {
  return (
    <Col md={md} className="mb-3">
      <Card
        className={`plasu-stat-card ${warn ? "warn" : ""} ${to ? "clickable" : ""} h-100`}
        {...(to ? { as: Link, to } : {})}
      >
        <Card.Body>
          <div className="stat-value">{value}</div>
          <div className="text-muted small">{label}</div>
        </Card.Body>
      </Card>
    </Col>
  );
}
