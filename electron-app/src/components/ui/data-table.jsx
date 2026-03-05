import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Checkbox } from "./checkbox";
import { Search } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";

export function DataTable({
  data,
  columns,
  emptyMessage = "No results found.",
  searchPlaceholder = "Search...",
  onSearch,
  searchable = true,
  selectable = false,
  selectedIds = new Set(),
  onSelectToggle,
  onSelectAll,
  rowIdKey = "id",
  onRowContextMenu,
  onRowClick,
  actions,
}) {
  const [searchValue, setSearchValue] = React.useState("");

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearchValue(val);
    if (onSearch) {
      onSearch(val);
    }
  };

  const isAllSelected = data.length > 0 && selectedIds.size === data.length;

  const handleSelectAll = (checked) => {
    if (onSelectAll) {
      onSelectAll(checked);
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {searchable && (
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={handleSearch}
              className="pl-9 bg-background"
            />
          </div>
        )}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {actions}
        </div>
      </div>

      {selectable && selectedCount > 0 && (
        <div className="flex items-center gap-3 text-sm bg-muted/50 p-2 rounded-md border text-muted-foreground w-max">
          <span className="font-medium text-foreground">{selectedCount}</span>{" "}
          items selected
        </div>
      )}

      {/* Table Content */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                {selectable && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={(checked) => handleSelectAll(checked)}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                {columns.map((col, idx) => (
                  <TableHead key={idx} className={col.className}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="h-32 text-center text-muted-foreground bg-accent/10"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, rowIndex) => {
                  const id = String(row[rowIdKey] || rowIndex);
                  const isSelected = selectedIds.has(id);

                  return (
                    <TableRow
                      key={id}
                      data-state={isSelected ? "selected" : undefined}
                      className="group transition-colors hover:bg-muted/50 cursor-pointer"
                      onClick={() => onRowClick && onRowClick(row)}
                      onContextMenu={(e) => {
                        if (onRowContextMenu) {
                          e.preventDefault();
                          onRowContextMenu(e, row);
                        }
                      }}
                    >
                      {selectable && (
                        <TableCell onClick={(e) => e.stopPropagation()} className="w-12">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onSelectToggle && onSelectToggle(id)}
                            aria-label={`Select item`}
                          />
                        </TableCell>
                      )}

                      {columns.map((col, colIndex) => {
                        let cellData = null;
                        if (col.cell) {
                          cellData = col.cell(row);
                        } else if (col.accessorKey) {
                          const keys = String(col.accessorKey).split(".");
                          cellData = keys.reduce(
                            (acc, key) => (acc ? acc[key] : undefined),
                            row
                          );
                        }

                        return (
                          <TableCell key={colIndex} className={col.className}>
                            {cellData}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
