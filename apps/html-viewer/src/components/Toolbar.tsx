import type { Table, Column } from '@tanstack/react-table';
import type { DependencyMetrics } from '../types.js';
import { useState, useRef, useEffect } from 'react';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  table: Table<DependencyMetrics>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
}

export function Toolbar({ table, globalFilter, onGlobalFilterChange }: ToolbarProps) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={styles.toolbar}>
      <input
        className={styles.search}
        type="text"
        placeholder="Search dependencies..."
        value={globalFilter}
        onChange={(e) => onGlobalFilterChange(e.target.value)}
      />

      <div className={styles.filters}>
        <FilterToggle
          label="Vulnerable"
          column={table.getColumn('vulnerabilities')}
        />
        <FilterToggle
          label="Outdated"
          column={table.getColumn('outdated')}
        />
        <FilterToggle
          label="Dev only"
          column={table.getColumn('dev')}
        />
      </div>

      <div className={styles.columnToggle} ref={dropdownRef}>
        <button
          className={styles.columnButton}
          onClick={() => setColumnsOpen((o) => !o)}
        >
          Columns
        </button>
        {columnsOpen && (
          <div className={styles.columnDropdown}>
            {table.getAllLeafColumns().map((column) => (
              <label key={column.id} className={styles.columnOption}>
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                />
                {typeof column.columnDef.header === 'string'
                  ? column.columnDef.header
                  : column.id}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterToggle({
  label,
  column,
}: {
  label: string;
  column: Column<DependencyMetrics> | undefined;
}) {
  if (!column) return null;

  const isActive = column.getFilterValue() === true;

  return (
    <button
      className={`${styles.filterButton} ${isActive ? styles.filterActive : ''}`}
      onClick={() => column.setFilterValue(isActive ? undefined : true)}
    >
      {label}
    </button>
  );
}
