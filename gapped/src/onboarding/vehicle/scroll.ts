/**
 * Where to scroll so a focused field sits above the keyboard. Pure.
 */

/**
 * The scroll offset that brings the span `top`–`bottom` (content coordinates)
 * fully into a `viewport`-tall window currently scrolled to `offset`, with
 * `margin` of breathing room — or null when it is already in view, so a field
 * the person can see is never yanked about.
 *
 * Prefers showing the bottom edge: the thing under a field (its error line,
 * the next field) is what the keyboard covers. A span taller than the window
 * is aligned to its top instead, so the person sees where it starts.
 */
export function scrollTargetFor({
  top,
  bottom,
  offset,
  viewport,
  margin,
}: {
  top: number;
  bottom: number;
  offset: number;
  viewport: number;
  margin: number;
}): number | null {
  if (!(viewport > 0)) return null;
  const wantTop = Math.max(0, top - margin);
  const wantBottom = bottom + margin;
  if (wantBottom - wantTop > viewport) return wantTop === offset ? null : wantTop;
  if (wantTop < offset) return wantTop;
  if (wantBottom > offset + viewport) return wantBottom - viewport;
  return null;
}
