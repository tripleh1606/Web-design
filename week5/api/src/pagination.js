const { Prisma } = require('../generated/postgresql');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 2147483647;
const MAX_PRICE = 2147483647;
const CATEGORIES = new Set(['coffee', 'matcha', 'houjicha']);
// All SQL identifiers/directions are server constants, never request strings.
const SORTS = {
  'id-asc': '"id" ASC',
  'id-desc': '"id" DESC',
  'price-asc': '"price" ASC, "id" ASC',
  'price-desc': '"price" DESC, "id" ASC',
  'name-asc': 'LOWER("name") ASC, "id" ASC',
  'name-desc': 'LOWER("name") DESC, "id" ASC'
};

function parsePageQuery(query) {
  const fields = {};
  const text = (key, { max = 120, blank = true } = {}) => {
    if (query[key] === undefined) return undefined;
    if (typeof query[key] !== 'string') {
      fields[key] = 'Chỉ gửi một giá trị chuỗi cho trường này.';
      return undefined;
    }
    const value = query[key].trim();
    if (value.length > max) fields[key] = `Tối đa ${max} ký tự.`;
    if (blank && !value) return undefined;
    return value;
  };
  const integer = (key, { min, max, fallback, blank = false }) => {
    const value = text(key, { blank });
    if (value === undefined) return fallback;
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) {
      fields[key] = `Phải là số nguyên từ ${min} đến ${max}.`;
      return fallback;
    }
    return number;
  };

  const page = integer('page', { min: 1, max: MAX_OFFSET, fallback: 1 });
  const pageSize = integer('pageSize', { min: 1, max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE });
  const q = text('q');
  const category = text('category');
  const minPrice = integer('minPrice', { min: 0, max: MAX_PRICE, blank: true });
  const maxPrice = integer('maxPrice', { min: 0, max: MAX_PRICE, blank: true });
  const availableText = text('available');
  const sort = text('sort') || 'id-asc';
  if (category !== undefined && !CATEGORIES.has(category)) fields.category = 'Chọn coffee, matcha hoặc houjicha.';
  if (availableText !== undefined && !['true', 'false'].includes(availableText)) fields.available = 'Chỉ nhận true hoặc false.';
  if (!Object.hasOwn(SORTS, sort)) fields.sort = 'Thứ tự sắp xếp không hợp lệ.';
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) fields.maxPrice = 'Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.';
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset > MAX_OFFSET) fields.page = `Offset tối đa là ${MAX_OFFSET}.`;
  // Fail explicitly for unsupported search modes instead of silently ignoring them.
  const allowed = new Set(['page', 'pageSize', 'q', 'category', 'minPrice', 'maxPrice', 'available', 'sort']);
  for (const key of Object.keys(query)) if (!allowed.has(key)) fields[key] = 'Query parameter chưa được hỗ trợ trên API phân trang.';
  return {
    fields,
    value: { page, pageSize, offset, q, category, minPrice, maxPrice,
      available: availableText === undefined ? undefined : availableText === 'true', sort }
  };
}

function pageQuery(options) {
  const conditions = [];
  if (options.q !== undefined) {
    // Parameter binding protects SQL syntax; escaping separately preserves literal %/_/!.
    const pattern = '%' + options.q.replace(/[!%_]/g, '!$&') + '%';
    conditions.push(Prisma.sql`LOWER("name") LIKE LOWER(${pattern}) ESCAPE '!'`);
  }
  if (options.category !== undefined) conditions.push(Prisma.sql`"category" = ${options.category}`);
  if (options.minPrice !== undefined) conditions.push(Prisma.sql`"price" >= ${options.minPrice}`);
  if (options.maxPrice !== undefined) conditions.push(Prisma.sql`"price" <= ${options.maxPrice}`);
  if (options.available !== undefined) conditions.push(Prisma.sql`"available" = ${options.available}`);
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  const order = Prisma.raw(SORTS[options.sort]);
  // One statement means one DB round trip and one snapshot. LEFT JOIN preserves
  // total even when the requested page is empty; both branches share the predicate.
  return Prisma.sql`SELECT "page".*, "totals"."__total"
    FROM (SELECT COUNT(*) AS "__total" FROM "dishes" ${where}) AS "totals"
    LEFT JOIN (
      SELECT "id", "name", "description", "price", "category", "image", "available", "createdAt"
      FROM "dishes" ${where} ORDER BY ${order} LIMIT ${options.pageSize} OFFSET ${options.offset}
    ) AS "page" ON TRUE
    ORDER BY ${order}`;
}

async function dishPage(prisma, options) {
  const rows = await prisma.$queryRaw(pageQuery(options));
  return {
    items: rows.filter((row) => row.id !== null).map(({ __total, ...row }) => ({ ...row, available: Boolean(row.available) })),
    total: Number(rows[0].__total), page: options.page, pageSize: options.pageSize
  };
}

module.exports = { parsePageQuery, pageQuery, dishPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
