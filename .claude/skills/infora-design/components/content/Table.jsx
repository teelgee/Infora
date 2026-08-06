import React from 'react';

/** Dense tabular data. Stays flat — never a row shadow. */
export function Table({ columns, rows, onRowClick }) {
  return (
    <table>
      <thead>
        <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
            {r.cells.map((cell, j) => (
              <td key={j} className={j === 0 && r.indent ? 'indent' : undefined}>
                {j === 0 && r.icon && <span className="ficon">{r.icon}</span>}
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
