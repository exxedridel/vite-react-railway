import { Table } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect } from "react";
import AppLoader from "@/components/AppLoader/AppLoader";
import { useAppContext } from "@/context/AppContext";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export default function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const { loading, setTableData } = useAppContext();

  useEffect(() => {
    setTableData([]);
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3">
      <div className="hidden md:block flex-1 text-sm text-muted-foreground">
        {/* {table.getFilteredSelectedRowModel().rows.length} of{" "}
        {table.getFilteredRowModel().rows.length} row(s) selected. */}
      </div>

      <div className="flex items-center justify-center text-sm ">
        <Button
          variant="outline"
          className="h-8 w-8 p-0 border-0 "
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to previous page</span>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <span className="text-sm border border-zinc-400 rounded-lg px-4 py-2 mx-0 md:mx-3">
          {table.getState().pagination.pageIndex + 1}{" "}
        </span>
        <Button
          variant="outline"
          className="h-8 w-8 p-0 border-0"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to next page</span>
          <ChevronRight className="h-6 w-6" />
        </Button>{" "}
        <span className="max-w-max pl-0 md:pl-3">
          de {table.getPageCount()} páginas
        </span>
      </div>

      <div className="flex items-center justify-center space-x-2">
        <Select
          value={`${table.getState().pagination.pageSize}`}
          onValueChange={(value) => {
            table.setPageSize(Number(value));
          }}
        >
          <SelectTrigger className="h-10 w-[70px] border-zinc-400">
            <SelectValue placeholder={table.getState().pagination.pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {[10, 20, 30, 40, 50].map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm font-medium">Items por página</p>
      </div>
      {loading && <AppLoader />}
    </div>
  );
}
