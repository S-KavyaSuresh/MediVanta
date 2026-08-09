import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Column<T> = {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
};

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
}: DataTableProps<T>) {
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="space-y-3 p-4 md:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
          >
            <div className="space-y-3">
              {columns.map((column) => {
                const value = row[column.key];

                return (
                  <div
                    key={String(column.key)}
                    className="grid min-w-0 grid-cols-[5.5rem_1fr] gap-3 text-sm"
                  >
                    <span className="font-medium text-[color:var(--muted-foreground)]">
                      {column.header}
                    </span>
                    <div className="min-w-0 text-[color:var(--foreground)]">
                      {column.render ? column.render(value, row) : String(value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[color:var(--surface-muted)] text-[color:var(--muted-foreground)]">
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} className="px-5 py-3 font-medium">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-[color:var(--border)] text-[color:var(--foreground)]"
              >
                {columns.map((column) => {
                  const value = row[column.key];

                  return (
                    <td
                      key={String(column.key)}
                      className={cn("px-5 py-4 align-middle", column.className)}
                    >
                      {column.render ? column.render(value, row) : String(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
