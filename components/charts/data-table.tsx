interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
}

interface DataTableProps {
  columns: Column[]
  rows: Record<string, React.ReactNode>[]
}

export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest text-text-muted ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-white/[0.04] transition-colors hover:bg-bg-subtle/50"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-5 py-3 text-white ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
