export function round2(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

export function applyDiscountOrOverride(
  baseTotal: number,
  discountPercent: number | undefined,
  overrideTotal: number | null | undefined,
): { totalRow: number; discountPercent: number; overrideTotal: number | null } {
  const discount = discountPercent ?? 0;
  if (overrideTotal != null && isFinite(overrideTotal)) {
    return { totalRow: overrideTotal, discountPercent: discount, overrideTotal };
  }
  if (isFinite(discount) && discount > 0) {
    const discounted = baseTotal * (1 - discount / 100);
    return { totalRow: discounted, discountPercent: discount, overrideTotal: null };
  }
  return { totalRow: baseTotal, discountPercent: 0, overrideTotal: null };
}
