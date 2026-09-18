#!/usr/bin/env python3
"""DOCX → PDF through Word in the cloud (Microsoft Graph), for machines without Word.

Why (18 Sep 2026): the Fly worker has no Word, and LibreOffice (7.4 and 26.8 both
tried) cannot read the sheets' equation paragraphs — one math paragraph holding
several equations aligned on "=" with soft breaks, the exact shape Adrian types —
so it ran the lines together with "¿" marks and re-paginated an 11-page A Math
sheet to 16. Graph's converter IS Word's engine, so the PDF matches the Mac's.

How: the DOCX is PUT into the app's own OneDrive folder (scope
Files.ReadWrite.AppFolder — nothing else of Adrian's is visible), fetched back
with `?format=pdf`, and deleted. Auth is a one-time device-code sign-in
(`python3 ms_graph_pdf.py login`), whose refresh token lives in the env
(`MS_GRAPH_REFRESH_TOKEN`, a Fly secret) or a state file. The newest refresh
token Microsoft hands back is kept in the state file so a 90-day expiry never
arrives while the worker is in use.

Env:  MS_GRAPH_CLIENT_ID      the Azure app registration (public client)
      MS_GRAPH_REFRESH_TOKEN  from `login`
      MS_GRAPH_STATE          where the rotated token is kept
                              (default $SHEETS_STATE_DIR/ms-graph-token.json,
                               else ~/.adrianmath_sheets/ms-graph-token.json)
CLI:  ms_graph_pdf.py login [--client-id ID]     one-time sign-in
      ms_graph_pdf.py test in.docx out.pdf       one conversion, for the eye
      ms_graph_pdf.py status                     configured? token fresh?
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
GRAPH = 'https://graph.microsoft.com/v1.0'
SCOPE = 'Files.ReadWrite.AppFolder offline_access'
CONVERT_RETRIES = 6          # the converter can lag a few seconds behind the upload


class GraphError(RuntimeError):
    pass


def _state_path() -> Path:
    p = os.environ.get('MS_GRAPH_STATE')
    if p:
        return Path(p)
    d = os.environ.get('SHEETS_STATE_DIR') or os.path.expanduser('~/.adrianmath_sheets')
    return Path(d) / 'ms-graph-token.json'


def _read_state() -> dict:
    try:
        return json.loads(_state_path().read_text())
    except Exception:
        return {}


def _write_state(d: dict):
    p = _state_path()
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix('.tmp')
        tmp.write_text(json.dumps(d))
        os.chmod(tmp, 0o600)
        tmp.replace(p)
    except OSError:
        pass


def client_id() -> str:
    return (os.environ.get('MS_GRAPH_CLIENT_ID') or _read_state().get('client_id') or '').strip()


def refresh_token() -> str:
    # the rotated token in the state file beats the one baked into the env
    return (_read_state().get('refresh_token') or os.environ.get('MS_GRAPH_REFRESH_TOKEN') or '').strip()


def configured() -> bool:
    return bool(client_id() and refresh_token())


def _post_form(url: str, data: dict) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            raise GraphError(f'{url}: HTTP {e.code}') from None


_access: dict = {}


def access_token() -> str:
    """A bearer for Graph, refreshed under a minute before it expires."""
    if _access and _access.get('exp', 0) - 60 > time.time():
        return _access['tok']
    cid, rt = client_id(), refresh_token()
    if not (cid and rt):
        raise GraphError('MS_GRAPH_CLIENT_ID / MS_GRAPH_REFRESH_TOKEN not set — run: python3 ms_graph_pdf.py login')
    res = _post_form(f'{AUTHORITY}/token', {
        'client_id': cid, 'grant_type': 'refresh_token', 'refresh_token': rt, 'scope': SCOPE,
    })
    if 'access_token' not in res:
        raise GraphError(f"token refresh failed: {res.get('error')}: {str(res.get('error_description', ''))[:200]}")
    _access.update(tok=res['access_token'], exp=time.time() + int(res.get('expires_in', 3600)))
    if res.get('refresh_token') and res['refresh_token'] != rt:
        st = _read_state(); st.update(refresh_token=res['refresh_token'], client_id=cid, rotated_at=int(time.time()))
        _write_state(st)
    return _access['tok']


def _graph(method: str, path: str, data: bytes | None = None, headers: dict | None = None, raw=False):
    h = {'Authorization': f'Bearer {access_token()}'}
    if headers:
        h.update(headers)
    req = urllib.request.Request(GRAPH + path if path.startswith('/') else path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
            return body if raw else (json.loads(body.decode()) if body else {})
    except urllib.error.HTTPError as e:
        msg = ''
        try:
            msg = e.read().decode()[:300]
        except Exception:
            pass
        raise GraphError(f'{method} {path}: HTTP {e.code} {msg}') from None


def export_pdf(docx_path: Path, pdf_path: Path) -> Path:
    """Upload, convert, download, delete. Raises GraphError on any failure so the
    caller can fall back."""
    docx_path, pdf_path = Path(docx_path), Path(pdf_path)
    name = f'sheet-{uuid.uuid4().hex[:10]}.docx'
    item = _graph('PUT', f'/me/drive/special/approot:/{name}:/content', data=docx_path.read_bytes(),
                  headers={'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
    item_id = item.get('id')
    if not item_id:
        raise GraphError('upload returned no item id')
    try:
        last = None
        for attempt in range(CONVERT_RETRIES):
            try:
                pdf = _graph('GET', f'/me/drive/items/{item_id}/content?format=pdf', raw=True)
                if pdf[:4] != b'%PDF':
                    raise GraphError('converter returned something that is not a PDF')
                pdf_path.parent.mkdir(parents=True, exist_ok=True)
                pdf_path.write_bytes(pdf)
                return pdf_path
            except GraphError as e:
                last = e
                if any(code in str(e) for code in ('HTTP 404', 'HTTP 409', 'HTTP 423', 'HTTP 429', 'HTTP 5')):
                    time.sleep(2 + 3 * attempt)
                    continue
                raise
        raise GraphError(f'conversion did not settle after {CONVERT_RETRIES} tries: {last}')
    finally:
        try:
            _graph('DELETE', f'/me/drive/items/{item_id}')
        except GraphError:
            pass


# ── one-time sign-in ────────────────────────────────────────────────────────

def login(cid: str | None):
    cid = (cid or client_id()).strip()
    if not cid:
        sys.exit('need the app (client) id: python3 ms_graph_pdf.py login --client-id <id>')
    dc = _post_form(f'{AUTHORITY}/devicecode', {'client_id': cid, 'scope': SCOPE})
    if 'device_code' not in dc:
        sys.exit(f"device-code request failed: {dc.get('error')}: {dc.get('error_description', '')}")
    print()
    print(dc.get('message') or f"Open {dc['verification_uri']} and enter the code {dc['user_code']}")
    print()
    interval = int(dc.get('interval', 5))
    deadline = time.time() + int(dc.get('expires_in', 900))
    while time.time() < deadline:
        time.sleep(interval)
        res = _post_form(f'{AUTHORITY}/token', {
            'client_id': cid, 'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'device_code': dc['device_code'],
        })
        err = res.get('error')
        if err == 'authorization_pending':
            continue
        if err == 'slow_down':
            interval += 5
            continue
        if err:
            sys.exit(f"sign-in failed: {err}: {res.get('error_description', '')[:200]}")
        rt = res.get('refresh_token')
        if not rt:
            sys.exit('sign-in gave no refresh token — was offline_access consented?')
        _write_state({'client_id': cid, 'refresh_token': rt, 'rotated_at': int(time.time())})
        print(f'Signed in. Token kept in {_state_path()} (mode 600).')
        print()
        print('For the Fly worker, set both as secrets (the values are in that file):')
        print(f'  fly secrets set -a adrianmath-worker MS_GRAPH_CLIENT_ID={cid} MS_GRAPH_REFRESH_TOKEN=<refresh_token from the file>')
        return
    sys.exit('sign-in timed out')


def status():
    print(f'client id:     {"set" if client_id() else "MISSING"}')
    print(f'refresh token: {"set" if refresh_token() else "MISSING"} (state file {_state_path()}{" present" if _state_path().exists() else " absent"})')
    if configured():
        try:
            access_token()
            me = _graph('GET', '/me/drive?$select=driveType,owner')
            print(f"drive:         {me.get('driveType')} — token refresh OK")
        except GraphError as e:
            print(f'token refresh FAILED: {e}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['login']:
        cid = args[args.index('--client-id') + 1] if '--client-id' in args else None
        login(cid)
    elif args[:1] == ['status']:
        status()
    elif args[:1] == ['test'] and len(args) == 3:
        t = time.time()
        out = export_pdf(Path(args[1]), Path(args[2]))
        print(f'{out} ({out.stat().st_size} bytes, {time.time() - t:.1f}s)')
    else:
        print(__doc__)
        sys.exit(64)
