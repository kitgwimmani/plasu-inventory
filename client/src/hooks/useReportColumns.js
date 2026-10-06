import { useEffect, useMemo, useState } from "react";

// Column customization for a report table, persisted per-report (per browser)
// so a user's preferred column set survives a reload. Every report defines its
// full set of possible columns once — `{ key, label, required, render(row),
// csv(row), align }` — and this hook turns the user's show/hide choices into
// the filtered list actually used to render the table, the CSV export and the
// PDF export, so all three always stay in sync with each other.
export default function useReportColumns(storageKey, allColumns) {
  const [hidden, setHidden] = useState(() => {
    try {
      const raw = localStorage.getItem(`plasu-report-cols:${storageKey}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`plasu-report-cols:${storageKey}`, JSON.stringify(hidden));
    } catch {
      // Private/incognito mode or storage disabled — column choice just won't persist.
    }
  }, [storageKey, hidden]);

  const isVisible = (key) => !hidden.includes(key);

  const columns = useMemo(
    () => allColumns.filter((c) => c.required || !hidden.includes(c.key)),
    [allColumns, hidden]
  );

  function toggle(key) {
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function resetColumns() {
    setHidden([]);
  }

  return { columns, allColumns, isVisible, toggle, resetColumns };
}
