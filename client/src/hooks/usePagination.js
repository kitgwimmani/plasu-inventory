import { useEffect, useMemo, useState } from "react";

// Client-side pagination over an already-filtered array. Resets to page 1
// whenever the filtered row count changes (e.g. a new search term narrows
// the result set) so users never land on an empty trailing page.
export default function usePagination(rows, initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const startIdx = (safePage - 1) * pageSize;
    return rows.slice(startIdx, startIdx + pageSize);
  }, [rows, safePage, pageSize]);

  return { page: safePage, setPage, pageSize, setPageSize, pageRows, total: rows.length };
}
