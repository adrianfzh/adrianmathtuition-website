// Shared ink types for the ✏️ Annotate overlay (SPEC-ANNOTATE.md).
//
// Stroke points live in PAGE-IMAGE PIXEL coordinates (the marked photo's own pixel
// grid), never screen pixels — zoom/pan is a pure view transform and flattening on
// Done draws them 1:1 onto the native-resolution page with no rescaling error.

export type StrokePoint = {
  x: number;
  y: number;
  /** Pointer pressure 0..1; 0.5 when the stylus reports none (mouse dev mode). */
  p: number;
};

export type ToolKind = 'pen' | 'highlighter';

export type SnappedShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'rect'; cx: number; cy: number; w: number; h: number; angle: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; angle: number }
  // 17 Sep 2026: a closed loop with three corners (Adrian: "triangles can't").
  | { kind: 'triangle'; points: [XYPt, XYPt, XYPt] }
  // 22 Sep 2026 (Adrian: "trace a curve, then the pen stroke snaps to the closest
  // fitted curve, like Notability"): an open stroke on a circle becomes a clean arc
  // (angles in radians, `sweep` signed), anything else held becomes a smoothed curve
  // (a chain of cubic Béziers, see lib/annotate/curve-fit).
  | { kind: 'arc'; cx: number; cy: number; r: number; a0: number; sweep: number }
  | { kind: 'curve'; beziers: [XYPt, XYPt, XYPt, XYPt][] };

export type XYPt = { x: number; y: number };

export type Stroke = {
  tool: ToolKind;
  color: string;
  /** Base stroke width in page-image pixels (converted from pt at the page's scale). */
  width: number;
  /**
   * Freehand path, or — when `snapped` is set — the clean polyline of the fitted
   * shape (2 pts line / 5 pts closed rect / 33 pts closed ellipse). One shape of
   * data everywhere: draft store, eraser hit-test and flatten all read `points`.
   */
  points: StrokePoint[];
  snapped?: SnappedShape['kind'];
  /** 17 Sep 2026: a typed note (student mode's text tool) — drawn at points[0], no outline. */
  text?: string;
  fontSize?: number;
};
