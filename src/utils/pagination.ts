export function parsePagination(query: any) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}

export function buildMeta(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    prev_page: page > 1 ? page - 1 : null,
    next_page: page < totalPages ? page + 1 : null,
    total,
    total_pages: totalPages,
  };
}
