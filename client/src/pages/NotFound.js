import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="text-center py-5">
      <h2>404</h2>
      <p className="text-muted">Page not found.</p>
      <Link to="/dashboard" className="btn btn-plasu">Back to Dashboard</Link>
    </div>
  );
}
