#!/usr/bin/env python3
"""Sandbox tests for the lead intake build. Run on server1:
    sudo python3 /opt/leadcase/tests/run_tests.py
Every case goes through the real public URL (Cloudflare -> Apache -> app -> n8n)
with the test token, so emails go to the sandbox inbox, never a real person.
Then it checks the database directly. Prints PASS/FAIL per check."""
import json, subprocess, sys, time, uuid, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = 'https://case.opsharbor.io'
ENV = dict(l.strip().split('=', 1) for l in open('/opt/leadcase/.env') if '=' in l and not l.startswith('#'))
TOKEN = ENV['TEST_TOKEN']
RUN = time.strftime('%m%d%H%M')
results = []

def post(payload, test=True):
    req = urllib.request.Request(BASE + '/api/leads', method='POST', data=json.dumps(payload).encode(),
        headers={'content-type': 'application/json', 'user-agent': 'leadcase-tests',
                 **({'x-test-token': TOKEN} if test else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def sql(q):
    out = subprocess.run(['docker', 'compose', '-f', '/opt/leadcase/docker-compose.yml', 'exec', '-T', 'db',
                          'psql', '-U', 'leadcase', '-d', 'leads', '-At', '-c', q], capture_output=True, text=True)
    return out.stdout.strip()

def check(name, ok, detail=''):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -> ' + str(detail) if detail and not ok else ''}")

def lead(email, comment='', interests='', name='Test Person', utm='test'):
    return {'full_name': name, 'email': email, 'comment': comment, 'interests': interests,
            'utm_source': utm, 'request_id': str(uuid.uuid4())}

e = lambda tag: f'{tag}-{RUN}@example.com'

print(f'Run {RUN}\n--- form responses')
s, b = post(lead(e('t1'), 'Need an invoice for payment', 'Docs, API, Support'))
check('1 normal lead is processed as welcome with 3 interests',
      s == 200 and b.get('status') == 'processed' and b.get('type') == 'welcome' and b.get('interests_count') == 3, b)

s, b = post(lead(e('t1'), 'Second try', 'Training'))
check('2 same email again is skipped', s == 200 and b.get('status') == 'skipped_duplicate', b)

s, b = post(lead('  ' + e('T1').upper().replace('@EXAMPLE.COM', '@Example.com') + ' ', 'Different case', 'API'))
check('3 same email in different capitals and spaces is skipped', s == 200 and b.get('status') == 'skipped_duplicate', b)

for tag, comment, expect in [('t4', 'urgent: need a call today', 'urgent'),
                             ('t5', 'URGENT - need a presentation', 'urgent'),
                             ('t6', 'This is not urgent, whenever works', 'welcome'),
                             ('t7', 'We urgently need help with setup', 'urgent')]:
    s, b = post(lead(e(tag), comment, 'Docs'))
    check(f'{tag[1:]} "{comment}" -> {expect}', s == 200 and b.get('type') == expect, b)

s, b = post(lead(e('t8'), 'Mixed casing', 'Api, API, api , docs'))
check('8 "Api, API, api , docs" becomes API + Docs (2)', b.get('interests') == ['API', 'Docs'] and b.get('interests_count') == 2, b)

s, b = post(lead(e('t9'), 'No interests picked', ''))
check('9 no interests -> processed with 0', b.get('status') == 'processed' and b.get('interests_count') == 0, b)

s, b = post(lead(e('t10'), 'Emoji in comment 🚀 and semicolons', 'Training; support\nDocs'))
check('10 semicolons and new lines split correctly', b.get('interests') == ['Training', 'Support', 'Docs'], b)

# Double click: the SAME request sent twice at once.
p = lead(e('t11'), 'double click', 'API')
with ThreadPoolExecutor(2) as ex:
    rs = list(ex.map(lambda _: post(p), range(2)))
statuses = sorted(r[1].get('status', str(r[0])) for r in rs)
check('11 double click (same request twice at once) -> 1 processed, 1 skipped',
      statuses == ['processed', 'skipped_duplicate'], rs)

# Race: two different submits for the same email at the same moment.
with ThreadPoolExecutor(2) as ex:
    rs = list(ex.map(lambda i: post(lead(e('t12'), f'race {i}', 'Docs')), range(2)))
statuses = sorted(r[1].get('status', str(r[0])) for r in rs)
check('12 two submits for one email at the same moment -> only 1 processed',
      statuses == ['processed', 'skipped_duplicate'], rs)

s, b = post(lead('not-an-email', 'bad', 'Docs'))
check('13 invalid email is rejected with 400 before n8n', s == 400 and 'email' in b.get('fields', {}), b)

hp = lead(e('t14'), 'I am a bot', 'Docs'); hp['website'] = 'http://spam.example'
s, b = post(hp)
check('14 honeypot filled -> looks accepted, nothing stored',
      s == 202 and sql(f"SELECT count(*) FROM leads WHERE email = '{e('t14')}'") == '0', b)

print('--- database checks')
time.sleep(8)  # let the async sheet mirror finish
like = f'%-{RUN}@example.com'
check('every processed email has exactly one Leads Log row',
      sql(f"SELECT count(*) FROM (SELECT email FROM leads WHERE email LIKE '{like}' AND status='processed' GROUP BY email HAVING count(*) > 1) x") == '0')
check('Leads Log interests_count matches Interest Log rows for every lead',
      sql(f"""SELECT count(*) FROM leads_log g LEFT JOIN (SELECT email, count(*) n FROM interest_log GROUP BY 1) c USING (email)
              WHERE g.email LIKE '{like}' AND g.interests_count <> coalesce(c.n, 0)""") == '0')
check('every done lead has an email sent time',
      sql(f"SELECT count(*) FROM leads_log WHERE email LIKE '{like}' AND (status <> 'done' OR email_sent_at IS NULL)") == '0')
n_leads = sql(f"SELECT count(*) FROM leads WHERE email LIKE '{like}'")
check('Leads keeps every submission, duplicates included (13 rows: double click counts once, rejected ones never stored)', n_leads == '13', n_leads)
check('no lead left stuck in received or failed',
      sql(f"SELECT count(*) FROM leads WHERE email LIKE '{like}' AND status IN ('received','failed')") == '0')
unsynced = sql(f"SELECT count(*) FROM leads WHERE email LIKE '{like}' AND NOT sheet_synced")
check('every submission was copied to the Google Sheet', unsynced == '0', f'{unsynced} not synced')

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
