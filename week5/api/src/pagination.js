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
  // Normalize Vietnamese accents, then score each query word. Every word must
  // match; unrelated trailing terms cannot be silently discarded. Resolve an
  // unknown long token to a unique complete anagram before retrieving records,
  // so a row containing a weaker word like "chai" cannot hide all "matcha" rows.
  // The correction vocabulary is global, independent of structured filters.
  // Materialization shares scoring between COUNT and the selected page.
  return Prisma.sql`WITH "terms" AS MATERIALIZED (
      SELECT unnest(tsvector_to_array(to_tsvector('simple', public.soucha_normalize_search(${options.q})))) AS term
    ), "named" AS MATERIALIZED (
      SELECT "id", "name", "description", "price", "category", "image", "available", "createdAt", "fts",
        tsvector_to_array(to_tsvector('simple', public.soucha_normalize_search("name"))) AS "__words"
      FROM "dishes"
    ), "filtered" AS MATERIALIZED (
      SELECT * FROM "named" ${where}
    ), "vocabulary" AS MATERIALIZED (
      SELECT DISTINCT unnest("__words") AS word FROM "named"
    ), "term_signatures" AS MATERIALIZED (
      SELECT term, ARRAY(SELECT letter FROM regexp_split_to_table(term, '') AS letters(letter) ORDER BY letter) AS letters
      FROM "terms" WHERE length(term) BETWEEN 5 AND 12
        AND NOT EXISTS (SELECT 1 FROM "vocabulary" WHERE word = term)
    ), "word_signatures" AS MATERIALIZED (
      SELECT word, ARRAY(SELECT letter FROM regexp_split_to_table(word, '') AS letters(letter) ORDER BY letter) AS letters
      FROM "vocabulary" WHERE length(word) IN (SELECT length(term) FROM "term_signatures")
    ), "corrections" AS MATERIALIZED (
      SELECT term, min(word) AS word FROM "term_signatures" JOIN "word_signatures" USING (letters)
      GROUP BY term HAVING count(*) = 1
    ), "resolved_terms" AS MATERIALIZED (
      SELECT term, coalesce("corrections".word, term) AS word FROM "terms" LEFT JOIN "corrections" USING (term)
    ), "resolution" AS MATERIALIZED (
      SELECT CASE WHEN EXISTS (SELECT 1 FROM "corrections") THEN string_agg(word, ' ' ORDER BY term) END AS query
      FROM "resolved_terms"
    ), "word_scores" AS MATERIALIZED (
      SELECT term, "vocabulary".word, public.soucha_word_score("resolved_terms".word, "vocabulary".word,
        (SELECT count(*)::integer FROM "terms")) AS score
      FROM "resolved_terms" CROSS JOIN "vocabulary"
    ), "best_terms" AS MATERIALIZED (
      SELECT "filtered"."id", "word_scores".term, max(score) AS best
      FROM "filtered" CROSS JOIN LATERAL unnest("__words") AS words(word)
      JOIN "word_scores" ON "word_scores".word = words.word
      GROUP BY "filtered"."id", "word_scores".term
    ), "fuzzy" AS MATERIALIZED (
      SELECT "id", min(best) AS minimum, avg(best) AS average FROM "best_terms" GROUP BY "id"
    ), "scored" AS MATERIALIZED (
      SELECT "filtered".*, ("fts" @@ ${tsquery}) AS "__exact",
        ("resolution".query IS NOT NULL AND "fts" @@ plainto_tsquery('simple', "resolution".query)) AS "__corrected",
        "fuzzy".minimum, "fuzzy".average
      FROM "filtered" LEFT JOIN "fuzzy" USING ("id") CROSS JOIN "resolution"
    ), "matches" AS MATERIALIZED (
      SELECT "id", "name", "description", "price", "category", "image", "available", "createdAt",
        CASE WHEN "__exact" THEN 2.0 + ts_rank("fts", ${tsquery}, 32)
          WHEN "__corrected" THEN 1.0 + ts_rank("fts", plainto_tsquery('simple', (SELECT query FROM "resolution")), 32)
          WHEN minimum >= 0.5 THEN average ELSE average * 0.5 END AS "__rank",
        CASE WHEN "__exact" THEN 'fulltext' WHEN "__corrected" THEN 'corrected'
          WHEN minimum >= 0.5 THEN 'fuzzy' ELSE 'suggestion' END AS "matchType"
      FROM "scored" WHERE "__exact" OR "__corrected" OR minimum >= 0.35::real
    ), "results" AS MATERIALIZED (
      SELECT * FROM "matches" WHERE "matchType" <> 'suggestion'
        OR NOT EXISTS (SELECT 1 FROM "matches" WHERE "matchType" <> 'suggestion')
    )
    SELECT "page".*, "totals"."__total", "resolution".query AS "__correctedQuery"
    FROM (SELECT count(*) AS "__total" FROM "results") AS "totals" CROSS JOIN "resolution"
    LEFT JOIN (SELECT * FROM "results" ORDER BY ${order} LIMIT ${options.pageSize} OFFSET ${options.offset}) AS "page" ON TRUE
    ORDER BY ${order}`;
}

async function dishPage(prisma, options) {
  const rows = await prisma.$queryRaw(pageQuery(options));
  return {
    items: rows.filter((row) => row.id !== null).map(({ __total, __rank, __correctedQuery, ...row }) => ({ ...row, available: Boolean(row.available),
      ...(__rank !== undefined && __rank !== null ? { rank: Number(__rank) } : {}) })),
    total: Number(rows[0].__total), page: options.page, pageSize: options.pageSize,
    ...(rows[0].__correctedQuery ? { correctedQuery: rows[0].__correctedQuery } : {})
  };
}

module.exports = { parsePageQuery, pageQuery, dishPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
