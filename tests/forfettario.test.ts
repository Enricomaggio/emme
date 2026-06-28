import { describe, it, expect } from 'vitest';
import { computeForfettario, FORFETTARIO_THRESHOLD, FORFETTARIO_ALERT_RATIO } from '@shared/forfettario';

// Regola unica del regime forfettario, ora condivisa tra server (dashboard.router)
// e client (dashboard.tsx). Prima era duplicata inline in entrambi.

describe('computeForfettario', () => {
  it('usa la soglia 100.000 di default', () => {
    expect(FORFETTARIO_THRESHOLD).toBe(100_000);
    expect(computeForfettario(0).threshold).toBe(100_000);
  });

  it('calcola percentuale e rimanente', () => {
    const r = computeForfettario(40_000);
    expect(r.percent).toBe(40);
    expect(r.remaining).toBe(60_000);
    expect(r.alert).toBe(false);
  });

  it('NON va in alert sotto l’80% della soglia', () => {
    expect(computeForfettario(79_999).alert).toBe(false);
  });

  it('va in alert esattamente all’80% (soglia inclusiva)', () => {
    expect(computeForfettario(80_000).alert).toBe(true);
    expect(computeForfettario(FORFETTARIO_THRESHOLD * FORFETTARIO_ALERT_RATIO).alert).toBe(true);
  });

  it('clampa percent a 100 e remaining a 0 oltre la soglia', () => {
    const r = computeForfettario(120_000);
    expect(r.percent).toBe(100);
    expect(r.remaining).toBe(0);
    expect(r.alert).toBe(true);
  });

  it('tratta importi non validi o negativi come 0', () => {
    expect(computeForfettario(-5_000).used).toBe(0);
    expect(computeForfettario(NaN).percent).toBe(0);
    expect(computeForfettario(-5_000).remaining).toBe(100_000);
  });

  it('rispetta una soglia personalizzata', () => {
    const r = computeForfettario(42_000, 84_000);
    expect(r.percent).toBe(50);
    expect(r.alert).toBe(false);
  });
});
