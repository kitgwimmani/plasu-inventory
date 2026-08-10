import React from "react";

// Shared printable header used by every report and receipt: institution logo +
// name, report title, generated-by/date/filter metadata, and a faint diagonal
// watermark across the page background.
export default function Letterhead({ title, subtitle, meta = [], watermark = "PLASU BOKKOS — OFFICIAL COPY" }) {
  return (
    <div className="print-letterhead">
      <div className="watermark">{watermark}</div>
      <div className="letterhead-row">
        <img src="/logo.png" alt="Institution logo" className="letterhead-logo" />
        <div className="letterhead-institution">
          <div className="institution-name">Plateau State University, Bokkos</div>
          <div className="institution-sub">Store Management Information System</div>
        </div>
        {meta.length > 0 && (
          <div className="letterhead-meta">
            {meta.map((m, i) => (
              <div key={i}>
                <strong>{m.label}:</strong> {m.value}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="letterhead-title">
        <h4>{title}</h4>
        {subtitle && <div className="text-muted small">{subtitle}</div>}
      </div>
      <hr />
    </div>
  );
}
