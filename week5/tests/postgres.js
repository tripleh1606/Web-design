const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const { unaccent } = require('@electric-sql/pglite/contrib/unaccent');
const { fuzzystrmatch } = require('@electric-sql/pglite/contrib/fuzzystrmatch');
module.exports = { postgres: () => new PGlite({ extensions: { pg_trgm, unaccent, fuzzystrmatch } }) };
