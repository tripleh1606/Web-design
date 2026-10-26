const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
module.exports = { postgres: () => new PGlite({ extensions: { pg_trgm } }) };
