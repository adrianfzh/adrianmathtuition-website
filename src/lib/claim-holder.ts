// Who holds a queued paper (18 Sep 2026, Adrian: "able to say which account has
// it?"). A plan-billed slot claims as `mac-plan-<host>-<pid>@<account e-mail>`
// (bot worker/plan-marking/run.sh) and the list already carries that string as
// `marked_by`. The Fly worker's host is its 14-hex machine id; a Mac's is its
// own name. Pure — the page only words what this returns.

export type ClaimHolder = { where: string; icon: string; account: string | null };

export function claimHolder(markedBy: string | null | undefined): ClaimHolder {
  const raw = String(markedBy || '').trim();
  const at = raw.indexOf('@');
  const left = at >= 0 ? raw.slice(0, at) : raw;
  const account = at >= 0 && raw.slice(at + 1).includes('@') ? raw.slice(at + 1) : null;
  const host = (left.match(/^mac-plan-(.+)-\d+$/) || [])[1] || '';
  if (/^[0-9a-f]{14}$/i.test(host)) return { where: 'the cloud worker', icon: '☁️', account };
  if (/air/i.test(host)) return { where: 'the MacBook Air', icon: '💻', account };
  return { where: 'your Mac', icon: '💻', account };
}

/** "☁️ the cloud worker (ablnon@gmail.com)" — the account only when it is known. */
export function claimHolderLabel(markedBy: string | null | undefined): string {
  const h = claimHolder(markedBy);
  return `${h.icon} ${h.where}${h.account ? ` (${h.account})` : ''}`;
}
