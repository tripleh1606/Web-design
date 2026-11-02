// Test fixture only: serialized transactions do not prove PostgreSQL locking.
function createAuthStore({ users = [] } = {}) {
  const state = { users: new Map(users.map(user => [user.id, structuredClone(user)])), sessions: new Map(), attempts: new Map(),
    activationAttempts: new Map(), challenges: new Map(), buckets: new Map(), passwordResets: new Map() };
  const matches = (row, where = {}) => Object.entries(where).every(([key, expected]) => {
    if (key === 'AND') return expected.every(part => matches(row, part));
    if (key === 'OR') return expected.some(part => matches(row, part));
    const value = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      return Object.entries(expected).every(([op, boundary]) => ({
        gt: () => value > boundary, gte: () => value >= boundary, lt: () => value < boundary,
        lte: () => value <= boundary, not: () => value !== boundary, in: () => boundary.includes(value),
        equals: () => value === boundary
      }[op]?.() ?? false));
    }
    return expected instanceof Date ? +value === +expected : value === expected;
  });
  function model(map, key, defaults = () => ({})) {
    let sequence = 0;
    const apply = (row, data) => {
      for (const [name, value] of Object.entries(data)) row[name] = value && typeof value === 'object' && 'increment' in value ? row[name] + value.increment : structuredClone(value);
    };
    return {
      async findUnique({ where, include } = {}) {
        const row = [...map.values()].find(value => matches(value, where));
        if (!row) return null;
        const copy = structuredClone(row);
        if (include?.user) copy.user = structuredClone(state.users.get(row.userId) || null);
        return copy;
      },
      async findMany({ where } = {}) { return structuredClone([...map.values()].filter(row => matches(row, where))); },
      async create({ data }) {
        const row = { ...defaults(), ...structuredClone(data) };
        if (key === 'id' && row.id === undefined) row.id = Math.max(0, ...map.keys(), sequence) + 1;
        sequence = row.id || sequence;
        if (map.has(row[key])) throw Object.assign(new Error('Unique violation'), { code: 'P2002' });
        map.set(row[key], row);
        return structuredClone(row);
      },
      async update({ where, data }) {
        const row = [...map.values()].find(value => matches(value, where));
        if (!row) throw Object.assign(new Error('Missing row'), { code: 'P2025' });
        apply(row, data);
        return structuredClone(row);
      },
      async upsert({ where, create, update }) {
        const row = [...map.values()].find(value => matches(value, where));
        return row ? this.update({ where, data: update }) : this.create({ data: create });
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of map.values()) if (matches(row, where)) { apply(row, data); count++; }
        return { count };
      },
      async deleteMany({ where } = {}) {
        let count = 0;
        for (const [id, row] of map.entries()) if (matches(row, where)) { map.delete(id); count++; }
        return { count };
      },
      async delete({ where }) {
        const row = await this.findUnique({ where });
        if (!row) throw new Error('Missing row');
        map.delete(row[key]);
        return row;
      }
    };
  }
  const prisma = {
    state,
    dish: {}, chef: {}, ingredient: {}, dishIngredient: {}, chefDish: {},
    user: model(state.users, 'id', () => ({ status: 'pending', role: 'viewer', emailVerifiedAt: null, createdAt: new Date(), updatedAt: new Date() })),
    session: model(state.sessions, 'sidHash'), loginAttempt: model(state.attempts, 'emailKey'),
    activationAttempt: model(state.activationAttempts, 'emailKey', () => ({ attempts: 0, lockedUntil: null })),
    activationChallenge: model(state.challenges, 'userId', () => ({ attempts: 0, lockedUntil: null, usedAt: null, purpose: 'activation' })),
    rateLimitBucket: model(state.buckets, 'key'),
    passwordReset: model(state.passwordResets, 'id', () => ({ usedAt: null, invalidatedAt: null, createdAt: new Date() })),
    async $executeRaw() { return 1; }, async $queryRaw() { return []; }
  };
  let tail = Promise.resolve();
  prisma.$transaction = async fn => {
    const prior = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await prior;
    const snapshots = Object.fromEntries(Object.entries(state).map(([name, map]) => [name, structuredClone(map)]));
    try { return await fn(prisma); }
    catch (error) {
      for (const [name, snapshot] of Object.entries(snapshots)) {
        state[name].clear();
        for (const [key, value] of snapshot) state[name].set(key, value);
      }
      throw error;
    } finally { release(); }
  };
  return prisma;
}
module.exports = { createAuthStore };
