/**
 * Clip 04's dashboard data: the shared DASHBOARD (src/data/wrenfield.ts) with
 * one typographic change. The shared tile count-up (countString in
 * src/shared/ui/charts.tsx) counts every ASCII digit, including the 2 in
 * "tCO2e", so a counting tile read "0 tCO0e" → "630 tCO1e" → "630 tCO2e".
 * Writing the unit with a subscript two (tCO₂e, the correct form anyway)
 * keeps it out of the count. Applied to every carbon unit on the dashboard so
 * the tile and the chart title match. Values are otherwise untouched.
 */
import { DASHBOARD, type DashboardData } from '../../data/wrenfield';

const sub2 = (s: string) => s.replace(/tCO2e/g, 'tCO₂e');

function local(d: DashboardData): DashboardData {
  return {
    ...d,
    tiles: d.tiles.map((t) => ({ ...t, value: sub2(t.value) })),
    line: { ...d.line, title: sub2(d.line.title) },
  };
}

export const DASH = { client: local(DASHBOARD.client), supplier: local(DASHBOARD.supplier) } as const;
