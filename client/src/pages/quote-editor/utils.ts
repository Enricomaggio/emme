export function formatEur(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function genUid(): string {
  return Math.random().toString(36).slice(2, 10);
}
