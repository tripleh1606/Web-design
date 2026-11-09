// One speculative page per menu instance. It never appends records or advances
// UI state; the real load operation still validates and accepts the response.
export function createPageBuffer(fetchPage) {
  let entry;
  return {
    warm(page) {
      if (entry?.page === page) return;
      const next = { page, promise: Promise.resolve().then(() => fetchPage(page)) };
      entry = next;
      next.promise.catch(() => { if (entry === next) entry = undefined; });
    },
    take(page) {
      const cached = entry?.page === page ? entry.promise : undefined;
      entry = undefined;
      return cached || fetchPage(page);
    },
    clear() { entry = undefined; }
  };
}
