// Границы пагинации. Значения сверх лимита отклоняются на уровне схемы запроса
// кодом 400, а не 422: это некорректный параметр, а не ошибка тела запроса.
export const MAX_LIMIT = 100;
export const MAX_OFFSET = 10_000;
export const DEFAULT_LIMIT = 20;
export const DEFAULT_PAGE = 1;

// Явный offset имеет приоритет над page: offset = (page - 1) * limit.
export function resolveOffset({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, offset } = {}) {
    if (offset !== undefined) return offset;
    return (page - 1) * limit;
}
