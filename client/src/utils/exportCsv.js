// Dependency-free CSV export. Every report builds its rows from the same
// `columns` array it uses to render the on-screen table (see useReportColumns),
// so whatever the user has chosen to show/hide on screen is exactly what ends
// up in the exported file — no separate "export mapping" to keep in sync.
//
// `columns`: [{ key, label, csv(row) => string|number }]
// `rows`: the data rows for the report.

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(columns, rows) {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(c.csv ? c.csv(row) : row[c.key])).join(",")
  );
  // Leading BOM so Excel opens UTF-8 CSVs (e.g. names with accents) correctly.
  return "﻿" + [header, ...lines].join("\r\n");
}

export function downloadCsv(filename, columns, rows) {
  const csv = buildCsv(columns, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
