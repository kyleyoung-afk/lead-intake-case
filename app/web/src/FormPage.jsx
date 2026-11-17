import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const OPTIONS = ['Docs', 'API', 'Support', 'Training'];

function initialUtm() {
  const p = new URLSearchParams(window.location.search);
  return p.get('utm_source') || '';
}

export default function FormPage() {
  const [form, setForm] = useState({ full_name: '', email: '', comment: '', utm_source: initialUtm(), website: '' });
  const [picked, setPicked] = useState([]);
  const [other, setOther] = useState('');
  const [state, setState] = useState({ phase: 'idle' });
  // One id per attempt. A double click sends the same id twice, and n8n
  // treats the second one as a repeat instead of a new lead.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (opt) => setPicked((p) => (p.includes(opt) ? p.filter((x) => x !== opt) : [...p, opt]));

  const interests = useMemo(
    () => [...picked, ...other.split(',').map((s) => s.trim()).filter(Boolean)].join(', '),
    [picked, other],
  );

  async function submit(e) {
    e.preventDefault();
    if (state.phase === 'sending') return;
    setState({ phase: 'sending' });
    try {
      const r = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, interests, request_id: requestId }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setState({ phase: 'error', message: body.error || 'Something went wrong.', fields: body.fields || {} });
      setState({ phase: 'done', result: body });
    } catch {
      setState({ phase: 'error', message: 'Network problem. Please try again.', fields: {} });
    }
  }

  function reset() {
    setForm({ full_name: '', email: '', comment: '', utm_source: form.utm_source, website: '' });
    setPicked([]);
    setOther('');
    setRequestId(crypto.randomUUID());
    setState({ phase: 'idle' });
  }

  if (state.phase === 'done') return <Result result={state.result} onReset={reset} />;

  const fieldErr = state.phase === 'error' ? state.fields : {};

  return (
    <section className="card narrow">
      <h1>Get in touch</h1>
      <p className="muted">Tell us what you need and we'll follow up by email.</p>
      <form onSubmit={submit} noValidate>
        <label>
          Name
          <input value={form.full_name} onChange={set('full_name')} autoComplete="name" required maxLength={120} />
          {fieldErr.full_name && <span className="err">{fieldErr.full_name}</span>}
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required maxLength={254} />
          {fieldErr.email && <span className="err">{fieldErr.email}</span>}
        </label>
        <label>
          Comment
          <textarea value={form.comment} onChange={set('comment')} rows={4} maxLength={2000}
            placeholder="What can we help with? Write 'urgent' if it can't wait." />
        </label>
        <fieldset>
          <legend>Interests</legend>
          <div className="chips">
            {OPTIONS.map((opt) => (
              <button type="button" key={opt} className={picked.includes(opt) ? 'chip on' : 'chip'}
                aria-pressed={picked.includes(opt)} onClick={() => toggle(opt)}>{opt}</button>
            ))}
          </div>
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Other (comma separated)" maxLength={300} />
        </fieldset>
        <label>
          utm_source
          <input value={form.utm_source} onChange={set('utm_source')} placeholder="direct" maxLength={100} />
        </label>
        {/* Honeypot. Hidden from people, visible to bots. */}
        <label className="hp" aria-hidden="true">
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
        </label>
        {state.phase === 'error' && <p className="err block">{state.message}</p>}
        <button className="primary" disabled={state.phase === 'sending'}>
          {state.phase === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}

function Result({ result, onReset }) {
  const dup = result.status === 'skipped_duplicate';
  return (
    <section className="card narrow">
      {dup ? (
        <>
          <h1>We already have you</h1>
          <p>This email was processed before, so nothing new was sent.</p>
        </>
      ) : (
        <>
          <h1>Thanks, you're in</h1>
          <p>
            {result.type === 'urgent'
              ? 'We marked this as urgent. Check your inbox for a confirmation.'
              : 'A welcome email is on its way.'}
          </p>
          <dl className="facts">
            <dt>Type</dt><dd>{result.type}</dd>
            <dt>Interests logged</dt><dd>{result.interests_count}</dd>
            {result.interests?.length > 0 && (<><dt>Saved as</dt><dd>{result.interests.join(', ')}</dd></>)}
          </dl>
        </>
      )}
      <div className="row">
        <button className="primary" onClick={onReset}>Send another</button>
        <Link to="/logs">See the logs</Link>
      </div>
    </section>
  );
}
