import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CaseRecord, JobDefinition } from '@/core/jobs';
import StateBadge from './StateBadge';

export type CaseListColumn = {
  label: string;
  className?: string;
  render: (row: CaseRecord) => ReactNode;
};

function formatAge(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export default function CaseList({
  rows,
  defs,
  hrefFor,
  columns = [],
  empty,
}: {
  rows: CaseRecord[];
  defs: Record<string, JobDefinition>;
  hrefFor: (row: CaseRecord) => string;
  columns?: CaseListColumn[];
  empty: string;
}) {
  if (!rows.length) return <p className="job-empty">{empty}</p>;
  return (
    <div className="job-table-wrap">
      <table className="job-table">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Customer</th>
            <th>State</th>
            {columns.map((column) => <th key={column.label} className={column.className}>{column.label}</th>)}
            <th className="job-num">Last change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><Link href={hrefFor(row)} className="job-ref">{row.ref}</Link></td>
              <td className="job-title-cell">{row.title}</td>
              <td><StateBadge def={defs[row.job]} state={row.state} /></td>
              {columns.map((column) => <td key={column.label} className={column.className}>{column.render(row)}</td>)}
              <td className="job-num job-dim">{formatAge(row.updated_at)} ago</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
