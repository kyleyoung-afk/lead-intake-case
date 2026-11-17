#!/usr/bin/env python3
"""Create or update the leadcase workflows in n8n from n8n/workflows/*.json.
Run on server1:  sudo python3 deploy/push-workflows.py [file ...]
Matches existing workflows by name, so it is safe to re-run."""
import json, os, sys, urllib.request, glob

env = dict(l.strip().split('=', 1) for l in open('/opt/leadcase/n8n-api.env') if '=' in l)
URL, KEY = env['N8N_URL'], env['N8N_API_KEY']

def api(method, path, body=None):
    req = urllib.request.Request(URL + '/api/v1' + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'X-N8N-API-KEY': KEY, 'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> {e.code}: {e.read().decode()[:800]}')

existing = {w['name']: w['id'] for w in api('GET', '/workflows?limit=250')['data']}
files = sys.argv[1:] or sorted(glob.glob('/opt/leadcase/n8n/workflows/*.json'))
ids = {}
for f in files:
    wf = json.load(open(f))
    body = {k: wf[k] for k in ('name', 'nodes', 'connections', 'settings')}
    if wf['name'] in existing:
        wid = existing[wf['name']]
        api('PUT', f'/workflows/{wid}', body)
        print('updated', wid, wf['name'])
    else:
        wid = api('POST', '/workflows', body)['id']
        print('created', wid, wf['name'])
    ids[os.path.basename(f)] = wid
print(json.dumps(ids))
