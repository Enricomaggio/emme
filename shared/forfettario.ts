// Regola unica del regime forfettario (soglia di ricavi + alert di avvicinamento).
// Estratta da server/routers/dashboard.router.ts e client/src/pages/dashboard.tsx,
// dove era duplicata inline: così soglia e regola d'allarme vivono in un solo posto.

/** Soglia ricavi del regime forfettario (2026). */
export const FORFETTARIO_THRESHOLD = 100_000;

/** Quota della soglia oltre la quale scatta l'allarme "vicino al limite". */
export const FORFETTARIO_ALERT_RATIO = 0.8;

export interface ForfettarioBreakdown {
  threshold: number;
  /** Importo usato (clampato a >= 0). */
  used: number;
  /** Quanto resta prima della soglia (mai negativo). */
  remaining: number;
  /** Percentuale intera 0-100, per la UI / KPI. */
  percent: number;
  /** true quando si è raggiunto FORFETTARIO_ALERT_RATIO della soglia. */
  alert: boolean;
}

export function computeForfettario(
  amount: number,
  threshold: number = FORFETTARIO_THRESHOLD,
): ForfettarioBreakdown {
  const used = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const ratio = threshold > 0 ? used / threshold : 0;
  return {
    threshold,
    used,
    remaining: Math.max(0, threshold - used),
    percent: Math.min(100, Math.round(ratio * 100)),
    alert: ratio >= FORFETTARIO_ALERT_RATIO,
  };
}
