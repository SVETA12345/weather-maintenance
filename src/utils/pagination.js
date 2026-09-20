export function paginate(items, { page = 1, limit = 2 }) {
    const total = items.length;
    const start = (page - 1) * limit;
    const data = items.slice(start, start + limit);
    return { data, meta: { total, page, limit } };
}