export type FuelType = "petrol" | "diesel";

export interface FuelCycle {
  from: string; // YYYY-MM-DD, inclusive
  to: string;   // YYYY-MM-DD, inclusive
  petrol: number;
  diesel: number;
}

// EPRA maximum pump prices for Nairobi, KSh per litre, including 8% VAT.
// EPRA announces a new cycle on the 14th of each month, effective the 15th.
// Each month: add ONE line at the top. Newest first.
export const FUEL_CYCLES: FuelCycle[] = [
  { from: "2026-10-15", to: "2026-11-14", petrol: 226.96, diesel: 227.76 },
  { from: "2026-09-15", to: "2026-10-14", petrol: 214.03, diesel: 217.86 },
  { from: "2026-07-15", to: "2026-08-14", petrol: 214.03, diesel: 222.86 },
];

/** The EPRA price in force on a given date, or null if that date isn't covered. */
export function priceFor(date: string, type: FuelType): { price: number; cycle: FuelCycle } | null {
  const cycle = FUEL_CYCLES.find((c) => date >= c.from && date <= c.to);
  return cycle ? { price: cycle[type], cycle } : null;
}
