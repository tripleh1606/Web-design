/**
 * How many full servings can be made from recipe lines.
 * Each line: { amount (>= 1), stock (>= 0) }.
 * Empty recipe → 0.
 */
function servingsPossible(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return 0;
  let min = Infinity;
  for (const line of lines) {
    const amount = Number(line.amount);
    const stock = Number(line.stock);
    if (!Number.isFinite(amount) || amount < 1 || !Number.isFinite(stock) || stock < 0) {
      return 0;
    }
    min = Math.min(min, Math.floor(stock / amount));
  }
  return Number.isFinite(min) ? min : 0;
}

function lineServings(amount, stock) {
  const a = Number(amount);
  const s = Number(stock);
  if (!Number.isFinite(a) || a < 1 || !Number.isFinite(s) || s < 0) return 0;
  return Math.floor(s / a);
}

module.exports = { servingsPossible, lineServings };
