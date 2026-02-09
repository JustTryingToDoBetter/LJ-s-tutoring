export type PaginationInput = {
  page?: unknown;
  pageSize?: unknown;
};

export type PaginationResult = {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
};

export function parsePagination(
  input: PaginationInput,
  defaults: { page?: number; pageSize?: number; maxPageSize?: number } = {}
): PaginationResult {
  const pageRaw = Number(input.page ?? defaults.page ?? 1);
  const pageSizeRaw = Number(input.pageSize ?? defaults.pageSize ?? 200);
  const maxPageSize = defaults.maxPageSize ?? 500;

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
    ? Math.min(Math.floor(pageSizeRaw), maxPageSize)
    : Math.min(defaults.pageSize ?? 200, maxPageSize);

  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, limit: pageSize };
}
