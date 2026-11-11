import {
  Table as AstryxTable,
  proportional,
  type TableProps,
} from "@astryxdesign/core/Table";

export { pixel } from "@astryxdesign/core/Table";

/** Keep columns readable on phones; Astryx owns touch and keyboard scrolling. */
export function Table<T extends Record<string, unknown>>(props: TableProps<T>) {
  return (
    <AstryxTable
      {...props}
      columns={props.columns?.map((column) => ({
        ...column,
        width: column.width ?? proportional(1),
      }))}
    />
  );
}
