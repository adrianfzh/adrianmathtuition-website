// ⭐ Star a paper (17 Sep 2026, Adrian: "let's do star a paper"): one tap
// marks a paper the student wants to come back to; starred papers float to
// the top of their subject tab, newest first among themselves. Pure.

/** Starred first, otherwise the caller's order (newest first) is kept. Stable. */
export function starredFirst<P extends { starred?: boolean }>(papers: readonly P[]): P[] {
  const on = papers.filter(p => p.starred);
  const off = papers.filter(p => !p.starred);
  return [...on, ...off];
}
