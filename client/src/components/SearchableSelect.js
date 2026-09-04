import React, { useEffect, useMemo, useRef, useState } from "react";
import { Form, Spinner } from "react-bootstrap";

// A single-select combobox: type to filter a long list of options instead of
// scrolling a native <select>. Drop-in alternative to <Form.Select> — same
// controlled value/onChange(string) contract — used anywhere a list of items,
// categories, subcategories, departments or people can get long.
//
// Pass `onCreate` to also offer "+ Add "<query>"" when nothing matches, e.g. so
// a Head of Store can create a missing subcategory inline without leaving the
// form. `onCreate(query)` should return the new { value, label } (or a promise
// of one); the new option is selected automatically.
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search…",
  disabled = false,
  allowClear = true,
  size,
  onCreate,
  createLabel,
  emptyLabel = "No matches",
  className,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  );

  useEffect(() => {
    function onDocMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term));
  }, [options, term]);

  const exactMatch = options.some((o) => o.label.toLowerCase() === term);
  const canCreate = !!(onCreate && term && !exactMatch && !creating);

  useEffect(() => setHighlight(0), [term, open]);

  const selectOption = (opt) => {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!onCreate || !query.trim()) return;
    setCreating(true);
    try {
      const opt = await onCreate(query.trim());
      if (opt) onChange(opt.value);
      setQuery("");
      setOpen(false);
    } catch (_) {
      // parent surfaces its own error state; keep the dropdown open with the typed text
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1 + (canCreate ? 1 : 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight < filtered.length) {
        if (filtered[highlight]) selectOption(filtered[highlight]);
      } else if (canCreate) {
        handleCreate();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  };

  return (
    <div className={`searchable-select ${className || ""}`} style={style} ref={containerRef}>
      <div className="searchable-select-control">
        <Form.Control
          ref={inputRef}
          size={size}
          disabled={disabled}
          autoComplete="off"
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : selected ? selected.label : ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {allowClear && selected && !open && !disabled && (
          <button
            type="button"
            className="searchable-select-clear"
            aria-label="Clear"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("");
            }}
          >
            <i className="bi bi-x-lg" />
          </button>
        )}
        <i className="bi bi-chevron-down searchable-select-caret" />
      </div>
      {open && !disabled && (
        <div className="searchable-select-menu">
          {filtered.map((o, idx) => (
            <div
              key={o.value}
              className={`searchable-select-option ${idx === highlight ? "is-highlighted" : ""} ${
                String(o.value) === String(value) ? "is-selected" : ""
              } ${o.disabled ? "is-disabled" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!o.disabled) selectOption(o);
              }}
              onMouseEnter={() => !o.disabled && setHighlight(idx)}
            >
              {o.label}
            </div>
          ))}
          {filtered.length === 0 && !canCreate && (
            <div className="searchable-select-empty">{emptyLabel}</div>
          )}
          {canCreate && (
            <div
              className={`searchable-select-option searchable-select-create ${
                highlight === filtered.length ? "is-highlighted" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleCreate();
              }}
              onMouseEnter={() => setHighlight(filtered.length)}
            >
              {creating ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Adding…
                </>
              ) : (
                createLabel ? createLabel(query.trim()) : (
                  <>
                    <i className="bi bi-plus-lg me-1" />
                    Add "{query.trim()}"
                  </>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
