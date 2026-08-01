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
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; angle: number };

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
};
