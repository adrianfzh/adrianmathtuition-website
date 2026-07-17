// Proration when a student switches weekly slots mid-month.
//
// The month's invoice was generated BEFORE the switch, billing the OLD weekday
// for the whole month. After a switch the student's actual lessons differ, so
// the invoice needs a correction.
//
// The OLD approach counted forward only: (new-weekday occurrences from the
// switch date) − (old-weekday occurrences from the switch date), × rate. That
// silently assumes every OLD-weekday lesson the invoice billed BEFORE the switch
// date actually happened. When it didn't, the correction was wrong. Live case
// (Kiara, Jul 2026): invoice billed 5 Fridays; she switched to Saturday and
// attended 4; her final Friday (3 Jul) was billed but never delivered. Both
// weekdays had 4 occurrences from the switch date, so the old formula produced
// $0 and the $70 overbill went uncaught.
//
// The fix reconciles against GROUND TRUTH: how many lessons the student actually
// has in the switch month now (after the switch adjusted the schedule) vs how
// many the issued invoice charged for. Pure + unit-tested.

export interface SwitchProration {
  /** Lessons the issued invoice actually charged for (base ÷ rate). */
  billedLessonCount: number;
  /** Lessons the student really has in the switch month, post-switch. */
  correctLessonCount: number;
  /** Signed dollars: negative = credit owed to the parent, positive = extra charge. */
  adjustment: number;
}

/**
 * @param correctLessonCount  Actual Regular, non-cancelled lessons the student
 *   has in the switch month AFTER the switch (count real lesson records — a
 *   rescheduled-away lesson still counts once, a cancelled/holiday one doesn't).
 * @param invoiceBaseAmount   The issued switch-month invoice's Base Amount (the
 *   lessons subtotal, before referral/deferred adjustments). Pass null/undefined
 *   when NO invoice was issued for that month yet — then there is nothing to
 *   reconcile and the adjustment is 0 (the monthly generator will bill the new
 *   enrollment correctly).
 * @param ratePerLesson       The student's per-lesson rate.
 */
export function computeSwitchProration(
  correctLessonCount: number,
  invoiceBaseAmount: number | null | undefined,
  ratePerLesson: number,
): SwitchProration {
  // No rate, or no invoice issued for the switch month → nothing to reconcile.
  if (!ratePerLesson || ratePerLesson <= 0 || invoiceBaseAmount == null) {
    return { billedLessonCount: 0, correctLessonCount, adjustment: 0 };
  }
  // Base Amount is lessons × rate, so this recovers the billed lesson count
  // regardless of how the line items were shaped (older invoices store no
  // per-lesson date). Round to defend against float/manual-edit noise.
  const billedLessonCount = Math.round(invoiceBaseAmount / ratePerLesson);
  const adjustment = Math.round((correctLessonCount - billedLessonCount) * ratePerLesson * 100) / 100;
  return { billedLessonCount, correctLessonCount, adjustment };
}
