import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface Column<T> {
  header: string;
  accessorKey: keyof T | string;
  cell?: (item: T) => React.ReactNode;
}

interface GenericTableProps<T> {
  data: T[];
  columns: Column<T>[];
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export function GenericTable<T>({
  data,
  columns,
  emptyMessage = 'No results.',
  onRowClick,
}: GenericTableProps<T>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col, index) => (
              <TableHead key={index}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length ? (
            data.map((row, rowIndex) => (
              <TableRow 
                key={rowIndex} 
                className={onRowClick ? "cursor-pointer hover:bg-muted" : ""}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map((col, colIndex) => {
                  let cellData = null;
                  if (col.cell) {
                    cellData = col.cell(row);
                  } else {
                    const keys = (col.accessorKey as string).split('.');
                    cellData = keys.reduce((acc: any, key) => (acc ? acc[key] : undefined), row);
                  }
                  
                  return (
                    <TableCell key={colIndex}>
                      {cellData as React.ReactNode}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
