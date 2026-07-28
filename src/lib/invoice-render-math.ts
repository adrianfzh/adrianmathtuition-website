// Reconciliation math for the invoice PDF renderer (lib so it's unit-tested —
// money policy). A PDF's total must always be explainable from its visible
// rows: manually-amended invoices used to carry the difference only in the
// Adjustment Amount field, so Tan Heng Kang's July 2026 PDF demanded $420
// while itemising $280 (the June additional lessons were invisible). The
// renderer prints any gap as an explicit "Adjustments" row.

export interface RenderableLineItem { rate?: number }
export interface RenderableExtraItem { amount: number | string }

/** Sum of everything the PDF's rows visibly display. */
export function renderedRowsSum(
  lineItems: RenderableLineItem[] | undefined,
  extras: RenderableExtraItem[] | undefined,
  ratePerLesson: number
): number {
  const items = (lineItems ?? []).reduce((s, it) => s + (it.rate ?? ratePerLesson ?? 0), 0);
  const extra = (extras ?? []).reduce((s, it) => s + (parseFloat(String(it.amount)) || 0), 0);
  return items + extra;
}

/**
 * Amount the final total exceeds the visible rows by (negative = credit).
 * |gap| < 1 cent → 0 (no reconciling row needed).
 */
export function reconciliationGap(
  finalAmount: number | string | undefined,
  lineItems: RenderableLineItem[] | undefined,
  extras: RenderableExtraItem[] | undefined,
  ratePerLesson: number
): number {
  const gap = (parseFloat(String(finalAmount || 0)) || 0) - renderedRowsSum(lineItems, extras, ratePerLesson);
  return Math.abs(gap) < 0.01 ? 0 : gap;
}
