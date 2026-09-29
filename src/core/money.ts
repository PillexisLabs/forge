// Money is stored and calculated in paise (integers), so totals are exact.
// Formatting is the only place rupees appear.

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  const formatted = Number.isInteger(rupees)
    ? INR.format(rupees)
    : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rupees);
  return `₹${formatted}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Percentage of an amount, from basis points (1800 = 18%), rounded to the paisa. */
export function percentOf(paise: number, basisPoints: number): number {
  return Math.round((paise * basisPoints) / 10000);
}
