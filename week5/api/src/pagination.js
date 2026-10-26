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
  'name-desc': 'LOWER("name") DESC, "id" ASC',
  'relevance': '"__rank" DESC, "id" ASC'
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
  const mode = text('mode') || 'basic';
  const category = text('category');
  const minPrice = integer('minPrice', { min: 0, max: MAX_PRICE, blank: true });
  const maxPrice = integer('maxPrice', { min: 0, max: MAX_PRICE, blank: true });
  const availableText = text('available');
  const ranked = mode === 'fulltext' || (mode === 'smart' && q !== undefined);
  const sort = text('sort') || (ranked ? 'relevance' : 'id-asc');
  if (!['basic', 'fulltext', 'smart'].includes(mode)) fields.mode = 'Chọn basic, fulltext hoặc smart.';
  if (mode === 'fulltext' && q === undefined) fields.q = 'Nhập từ khóa cho Full-text search.';
  if (category !== undefined && !CATEGORIES.has(category)) fields.category = 'Chọn coffee, matcha hoặc houjicha.';
  if (availableText !== undefined && !['true', 'false'].includes(availableText)) fields.available = 'Chỉ nhận true hoặc false.';
  if (!Object.hasOwn(SORTS, sort)) fields.sort = 'Thứ tự sắp xếp không hợp lệ.';
  else if (mode === 'fulltext' && sort !== 'relevance') fields.sort = 'Full-text sắp xếp theo độ liên quan, sau đó theo id.';
  else if (!ranked && sort === 'relevance') fields.sort = 'Độ liên quan cần từ khóa ở chế độ Full-text hoặc Thông minh.';
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) fields.maxPrice = 'Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.';
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset > MAX_OFFSET) fields.page = `Offset tối đa là ${MAX_OFFSET}.`;
  // Fail explicitly for unsupported search modes instead of silently ignoring them.
  const allowed = new Set(['mode', 'page', 'pageSize', 'q', 'category', 'minPrice', 'maxPrice', 'available', 'sort']);
  for (const key of Object.keys(query)) if (!allowed.has(key)) fields[key] = 'Query parameter chưa được hỗ trợ trên API phân trang.';
  return {
    fields,
    value: { page, pageSize, offset, q, mode, category, minPrice, maxPrice,
      available: availableText === undefined ? undefined : availableText === 'true', sort }
  };
}

function pageQuery(options) {
  const conditions = [];
  const fulltext = options.mode === 'fulltext';
  const tsquery = fulltext ? Prisma.sql`plainto_tsquery('simple', ${options.q})` : undefined;
  if (fulltext) {
    conditions.push(Prisma.sql`"fts" @@ ${tsquery}`);
  } else if (options.q !== undefined) {
    // Parameter binding protects SQL syntax; escaping separately preserves literal %/_/!.
    const pattern = '%' + options.q.replace(/[!%_]/g, '!$&') + '%';
    conditions.push(Prisma.sql`LOWER("name") LIKE LOWER(${pattern}) ESCAPE '!'`);
  }
  if (options.category !== undefined) conditions.push(Prisma.sql`"category" = ${options.category}`);
  if (options.minPrice !== undefined) conditions.push(Prisma.sql`"price" >= ${options.minPrice}`);
  if (options.maxPrice !== undefined) conditions.push(Prisma.sql`"price" <= ${options.maxPrice}`);
  if (options.available !== undefined) conditions.push(Prisma.sql`"available" = ${options.available}`);
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  if (options.mode === 'smart' && options.q !== undefined) return smartPageQuery(options);
  const order = Prisma.raw(SORTS[options.sort]);
  const ranking = fulltext ? Prisma.sql`, ts_rank("fts", ${tsquery}) AS "__rank"` : Prisma.empty;
  // One statement means one DB round trip and one snapshot. LEFT JOIN preserves
  // total even when the requested page is empty; both branches share the predicate.
  return Prisma.sql`SELECT "page".*, "totals"."__total"
    FROM (SELECT COUNT(*) AS "__total" FROM "dishes" ${where}) AS "totals"
    LEFT JOIN (
      SELECT "id", "name", "description", "price", "category", "image", "available", "createdAt" ${ranking}
      FROM "dishes" ${where} ORDER BY ${order} LIMIT ${options.pageSize} OFFSET ${options.offset}
    ) AS "page" ON TRUE
    ORDER BY ${order}`;
}

function smartPageQuery(options) {
  const filters = [];
  if (options.category !== undefined) filters.push(Prisma.sql`"category" = ${options.category}`);
  if (options.minPrice !== undefined) filters.push(Prisma.sql`"price" >= ${options.minPrice}`);
  if (options.maxPrice !== undefined) filters.push(Prisma.sql`"price" <= ${options.maxPrice}`);
  if (options.available !== undefined) filters.push(Prisma.sql`"available" = ${options.available}`);
  const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
  const tsquery = Prisma.sql`plainto_tsquery('simple', ${options.q})`;
  const order = Prisma.raw(SORTS[options.sort]);
  // All query words must match a name word sufficiently well. This avoids
  // returning every Houjicha when the second word is unrelated. Token order
  // and intervening name words do not matter. Short tokens require exactness.
  // One adjacent keyboard transposition is handled explicitly: whsik -> whisk.
  // Materialization shares scoring between COUNT and the selected page.
  return Prisma.sql`WITH "terms" AS MATERIALIZED (
      SELECT unnest(tsvector_to_array(to_tsvector('simple', ${options.q}))) AS term
    ), "filtered" AS MATERIALIZED (
      SELECT "id", "name", "description", "price", "category", "image", "available", "createdAt", "fts"
      FROM "dishes" ${where}
    ), "scored" AS MATERIALIZED (
      SELECT "filtered".*, ("fts" @@ ${tsquery}) AS "__exact", "fuzzy".*
      FROM "filtered" CROSS JOIN LATERAL (
        SELECT min(best) AS minimum, avg(best) AS average FROM (
          SELECT (SELECT max(CASE
            WHEN term = word THEN 1.0
            WHEN length(term) >= 3 AND abs(length(term) - length(word)) <= greatest(1, length(term) / 4)
              THEN greatest(similarity(term, word), CASE WHEN length(term) = length(word) AND EXISTS (
                SELECT 1 FROM generate_series(1, length(term) - 1) AS position(i)
                WHERE word = left(term, i - 1) || substr(term, i + 1, 1) || substr(term, i, 1) || substr(term, i + 2)
              ) THEN 0.8 ELSE 0 END)
            ELSE 0 END)
            FROM unnest(tsvector_to_array(to_tsvector('simple', "filtered"."name"))) AS words(word)
          ) AS best FROM "terms"
        ) AS similarities
      ) AS "fuzzy"
    ), "matches" AS MATERIALIZED (
      SELECT "id", "name", "description", "price", "category", "image", "available", "createdAt",
        CASE WHEN "__exact" THEN 1.0 + ts_rank("fts", ${tsquery}, 32) ELSE average END AS "__rank",
        CASE WHEN "__exact" THEN 'fulltext' ELSE 'fuzzy' END AS "matchType"
      FROM "scored" WHERE "__exact" OR minimum >= 0.3
    )
    SELECT "page".*, "totals"."__total" FROM (SELECT count(*) AS "__total" FROM "matches") AS "totals"
    LEFT JOIN (SELECT * FROM "matches" ORDER BY ${order} LIMIT ${options.pageSize} OFFSET ${options.offset}) AS "page" ON TRUE
    ORDER BY ${order}`;
}

async function dishPage(prisma, options) {
  const rows = await prisma.$queryRaw(pageQuery(options));
  return {
    items: rows.filter((row) => row.id !== null).map(({ __total, __rank, ...row }) => ({ ...row, available: Boolean(row.available),
      ...(__rank !== undefined && __rank !== null ? { rank: Number(__rank) } : {}) })),
    total: Number(rows[0].__total), page: options.page, pageSize: options.pageSize
  };
}

module.exports = { parsePageQuery, pageQuery, dishPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
