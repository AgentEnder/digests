import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ExpandedState,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DependencyMetrics } from '../types.js';
import { Toolbar } from './Toolbar.js';
import { DetailPanel } from './DetailPanel.js';
import styles from './DataTable.module.css';

const columnHelper = createColumnHelper<DependencyMetrics>();

function formatDownloads(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

const booleanFilterFn: FilterFn<DependencyMetrics> = (row, columnId, filterValue) => {
  if (filterValue === undefined || filterValue === null) return true;
  return row.getValue(columnId) === filterValue;
};

const vulnFilterFn: FilterFn<DependencyMetrics> = (row, _columnId, filterValue) => {
  if (filterValue === undefined || filterValue === null) return true;
  const vulns = row.original.vulnerabilities;
  return filterValue === true ? vulns.length > 0 : true;
};

const outdatedFilterFn: FilterFn<DependencyMetrics> = (row, _columnId, filterValue) => {
  if (filterValue === undefined || filterValue === null) return true;
  const dep = row.original;
  return dep.latestVersion !== 'unknown' && dep.version !== dep.latestVersion;
};

const globalFilterFn: FilterFn<DependencyMetrics> = (row, _columnId, filterValue) => {
  const search = (filterValue as string).toLowerCase();
  const dep = row.original;
  return (
    dep.name.toLowerCase().includes(search) ||
    dep.version.toLowerCase().includes(search) ||
    (dep.license?.toLowerCase().includes(search) ?? false) ||
    (dep.ecosystem?.toLowerCase().includes(search) ?? false) ||
    (dep.description?.toLowerCase().includes(search) ?? false)
  );
};

type RenderItem =
  | { kind: 'row'; row: Row<DependencyMetrics> }
  | { kind: 'detail'; row: Row<DependencyMetrics> };

interface DataTableProps {
  deps: DependencyMetrics[];
}

export function DataTable({ deps }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnVisibility, setColumnVisibility] = useState({});
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Package',
        size: 240,
        cell: (info) => {
          const dep = info.row.original;
          return (
            <button
              className={styles.expandButton}
              onClick={() => info.row.toggleExpanded()}
              title="Toggle details"
            >
              <span className={styles.expandIcon}>
                {info.row.getIsExpanded() ? '▼' : '▶'}
              </span>
              <span className={styles.packageName}>{dep.name}</span>
            </button>
          );
        },
      }),
      columnHelper.accessor('version', {
        header: 'Version',
        size: 100,
        cell: (info) => <code className={styles.code}>{info.getValue()}</code>,
      }),
      columnHelper.accessor('latestVersion', {
        header: 'Latest',
        size: 100,
        cell: (info) => {
          const dep = info.row.original;
          const isOutdated =
            dep.latestVersion !== 'unknown' && dep.version !== dep.latestVersion;
          return (
            <code className={`${styles.code} ${isOutdated ? styles.outdated : ''}`}>
              {info.getValue()}
            </code>
          );
        },
      }),
      columnHelper.accessor('license', {
        header: 'License',
        size: 120,
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('dev', {
        header: 'Dev',
        size: 60,
        cell: (info) => (info.getValue() ? 'Yes' : 'No'),
        filterFn: booleanFilterFn,
      }),
      columnHelper.accessor('transitive', {
        header: 'Transitive',
        size: 90,
        cell: (info) => (info.getValue() ? 'Yes' : 'No'),
      }),
      columnHelper.accessor('ecosystem', {
        header: 'Ecosystem',
        size: 100,
      }),
      columnHelper.accessor('downloads', {
        header: 'Downloads/wk',
        size: 120,
        cell: (info) => formatDownloads(info.getValue()),
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.downloads ?? -1;
          const b = rowB.original.downloads ?? -1;
          return a - b;
        },
      }),
      columnHelper.accessor('vulnerabilities', {
        id: 'vulnerabilities',
        header: 'CVEs',
        size: 60,
        cell: (info) => {
          const count = info.getValue().length;
          if (count === 0) return <span className={styles.muted}>0</span>;
          return <span className={styles.vulnBadge}>{count}</span>;
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.vulnerabilities.length;
          const b = rowB.original.vulnerabilities.length;
          return a - b;
        },
        filterFn: vulnFilterFn,
      }),
      columnHelper.display({
        id: 'outdated',
        header: () => null,
        cell: () => null,
        size: 0,
        enableHiding: true,
        filterFn: outdatedFilterFn,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: deps,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      expanded,
      columnVisibility: { ...columnVisibility, outdated: false },
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    globalFilterFn,
    getRowCanExpand: () => true,
  });

  // Flatten rows + expanded details into a single render list
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    for (const row of table.getRowModel().rows) {
      items.push({ kind: 'row', row });
      if (row.getIsExpanded()) {
        items.push({ kind: 'detail', row });
      }
    }
    return items;
  }, [table.getRowModel().rows]);

  const estimateSize = useCallback(
    (index: number) => {
      const item = renderItems[index];
      return item.kind === 'detail' ? 320 : 33;
    },
    [renderItems],
  );

  const rowVirtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize,
    overscan: 20,
    // Measure dynamic row height, except in Firefox (measures table border height incorrectly)
    measureElement:
      typeof window !== 'undefined' &&
      navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer]);

  // Compute total column size for percentage-based widths
  const columnSizeTotal = useMemo(() => {
    return table
      .getVisibleFlatColumns()
      .filter((c) => c.id !== 'outdated')
      .reduce((sum, col) => sum + col.getSize(), 0);
  }, [table.getVisibleFlatColumns()]);

  const colWidth = useCallback(
    (size: number) => `${(size / columnSizeTotal) * 100}%`,
    [columnSizeTotal],
  );

  return (
    <div>
      <Toolbar
        table={table}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
      />
      <div
        className={styles.tableWrapper}
        ref={tableContainerRef}
        style={{
          overflow: 'auto',
          position: 'relative',
          height: '70vh',
        }}
      >
        {/* Use CSS Grid on the table for virtualization compatibility */}
        <table style={{ display: 'grid' }}>
          <thead
            style={{
              display: 'grid',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ display: 'flex', width: '100%' }}>
                {headerGroup.headers.map((header) => {
                  if (header.id === 'outdated') return null;
                  return (
                    <th
                      key={header.id}
                      className={`${styles.th} ${header.column.getCanSort() ? styles.sortable : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ display: 'flex', width: colWidth(header.getSize()) }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && ' ↑'}
                      {header.column.getIsSorted() === 'desc' && ' ↓'}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody
            style={{
              display: 'grid',
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = renderItems[virtualItem.index];

              if (item.kind === 'detail') {
                return (
                  <tr
                    key={`${item.row.id}-detail`}
                    data-index={virtualItem.index}
                    ref={(node) => rowVirtualizer.measureElement(node)}
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      transform: `translateY(${virtualItem.start}px)`,
                      width: '100%',
                    }}
                  >
                    <td
                      className={styles.detailTd}
                      style={{
                        display: 'flex',
                        flex: '1 0 auto',
                      }}
                    >
                      <DetailPanel dep={item.row.original} />
                    </td>
                  </tr>
                );
              }

              const { row } = item;
              return (
                <tr
                  key={row.id}
                  data-index={virtualItem.index}
                  ref={(node) => rowVirtualizer.measureElement(node)}
                  className={row.getIsExpanded() ? styles.expandedRow : ''}
                  style={{
                    display: 'flex',
                    position: 'absolute',
                    transform: `translateY(${virtualItem.start}px)`,
                    width: '100%',
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    if (cell.column.id === 'outdated') return null;
                    return (
                      <td
                        key={cell.id}
                        className={styles.td}
                        style={{ display: 'flex', width: colWidth(cell.column.getSize()) }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.footer}>
        {table.getFilteredRowModel().rows.length} of {deps.length} dependencies
      </div>
    </div>
  );
}
