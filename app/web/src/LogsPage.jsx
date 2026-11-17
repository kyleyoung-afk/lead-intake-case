import { useEffect, useState } from 'react';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '');
const ago = (d) => {
  if (!d) return 'never';
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export default function LogsPage() {
  const [email, setEmail] = useState('');
  const [interest, setInterest] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ email, interest });
        const r = await fetch(`/api/logs?${q}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error();
        setData(await r.json());
        setError('');
      } catch (e) {
        if (e.name !== 'AbortError') setError('Could not load the logs.');
      }
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [email, interest]);

  return (
    <div className="stack">
      <Health />
      <Summary />
      <section className="card">
        <div className="filters">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Search by email" />
          </label>
          <label>
            Interest
            <select value={interest} onChange={(e) => setInterest(e.target.value)}>
              <option value="">All interests</option>
              {data?.interests.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          {(email || interest) && (
            <button className="link" onClick={() => { setEmail(''); setInterest(''); }}>Clear filters</button>
          )}
        </div>
        {error && <p className="err block">{error}</p>}
      </section>

      <section className="card">
        <h2>Leads Log <span className="count">{data?.leads_log.length ?? ''}</span></h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Email</th><th>Type</th><th>Interests</th><th>Status</th><th>Email sent</th><th>Logged</th></tr></thead>
            <tbody>
              {data?.leads_log.map((r) => (
                <tr key={r.email}>
                  <td>{r.email}{r.is_test && <span className="tag">test</span>}</td>
                  <td><span className={`pill ${r.type}`}>{r.type}</span></td>
                  <td className="num">{r.interests_count}</td>
                  <td>{r.status}</td>
                  <td>{fmt(r.email_sent_at)}</td>
                  <td>{fmt(r.created_at)}</td>
                </tr>
              ))}
              {data && data.leads_log.length === 0 && <tr><td colSpan={6} className="muted">No rows match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Interest Log <span className="count">{data?.interest_log.length ?? ''}</span></h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Email</th><th>Interest</th><th>Logged</th></tr></thead>
            <tbody>
              {data?.interest_log.map((r) => (
                <tr key={`${r.email}|${r.interest}`}>
                  <td>{r.email}{r.is_test && <span className="tag">test</span>}</td>
                  <td>{r.interest}</td>
                  <td>{fmt(r.created_at)}</td>
                </tr>
              ))}
              {data && data.interest_log.length === 0 && <tr><td colSpan={3} className="muted">No rows match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Summary() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/summary')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setS)
      .catch(() => setErr('Summary is unavailable right now.'));
  }, []);

  return (
    <section className="card summary">
      <div className="summary-head">
        <h2>Summary</h2>
        {s && (
          <span className={s.check?.passed ? 'badge ok' : 'badge warn'}
            title={s.check?.passed ? 'Every number in the summary matched the database.' : (s.check?.issues || []).join('\n')}>
            {s.check?.passed ? 'Numbers checked' : 'Check failed'}
          </span>
        )}
      </div>
      {err && <p className="muted">{err}</p>}
      {!s && !err && <p className="muted">Writing summary…</p>}
      {s && (
        <>
          <p className="summary-text">{s.summary}</p>
          {!s.check?.passed && s.check?.issues?.length > 0 && (
            <ul className="issues">{s.check.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          )}
          <dl className="factrow">
            <div><dt>Leads</dt><dd>{s.facts.leads}</dd></div>
            <div><dt>Urgent</dt><dd>{s.facts.urgent}</dd></div>
            <div><dt>Welcome</dt><dd>{s.facts.welcome}</dd></div>
            <div><dt>Interest rows</dt><dd>{s.facts.interest_rows}</dd></div>
            <div><dt>Top interest</dt><dd>{s.facts.top_interests?.[0]?.interest ?? '-'}</dd></div>
          </dl>
          <p className="fine">
            Written by {s.model} {ago(s.generated_at)}. The numbers above come straight from the database,
            and every number in the text is checked against them.
          </p>
        </>
      )}
    </section>
  );
}

function Health() {
  const [h, setH] = useState(null);
  useEffect(() => {
    const load = () => fetch('/api/health').then((r) => r.json()).then(setH).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!h) return null;
  const bad = h.failed > 0 || h.open_alerts > 0 || h.watchdog_stale;
  return (
    <section className={`card health ${bad ? 'bad' : 'good'}`}>
      <strong>{bad ? 'Needs attention' : 'All systems normal'}</strong>
      <span>{h.submissions} submissions</span>
      <span>{h.processed} processed</span>
      <span>{h.skipped_duplicates} duplicates skipped</span>
      <span>{h.failed} failed</span>
      <span>{h.open_alerts} open alerts</span>
      <span>watchdog: {h.watchdog_stale ? 'NOT RUNNING' : ago(h.watchdog_last_run_at)}</span>
    </section>
  );
}
