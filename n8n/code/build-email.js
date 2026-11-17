// Build email (Code node, run once for all items).
// The brief says the two templates are in the spreadsheet. They aren't,
// so these are mine. Email-safe HTML: tables, inline styles, no images,
// plus a plain-text version for clients that don't show HTML.
const lead = $('Clean input').first().json;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = lead.full_name.split(' ')[0] || 'there';
const urgent = lead.type === 'urgent';

const NEXT = {
  API: ['API', 'We will send setup steps and keys for your account.'],
  Docs: ['Docs', 'Start with the quick-start guide. It takes about 10 minutes.'],
  Support: ['Support', 'Reply to this email any time and it reaches a person.'],
  Training: ['Training', 'We run live onboarding sessions every week. We will send dates.'],
};
const steps = lead.interests.map((i) => NEXT[i] || [i, 'We will follow up with what we have on this.']);

// ---- content ----------------------------------------------------------------
const C = urgent
  ? {
      subject: 'We got your urgent request',
      preheader: 'A person on our team will contact you within 1 business hour.',
      badge: 'URGENT REQUEST RECEIVED',
      accent: '#c92a2a', accentSoft: '#fff5f5',
      title: `We're on it, ${first}.`,
      intro: 'Your message is marked urgent, so it skipped the queue. A person on our team will contact you within <strong>1 business hour</strong>.',
    }
  : {
      subject: `Welcome, ${first}`,
      preheader: 'Thanks for getting in touch. Here is what happens next.',
      badge: 'WELCOME',
      accent: '#3b5bdb', accentSoft: '#edf2ff',
      title: `Thanks for reaching out, ${first}.`,
      intro: 'We got your message and a person will reply within <strong>1 business day</strong>. Here is what happens next.',
    };

const quote = lead.comment
  ? `<tr><td style="padding:0 32px 24px">
       <div style="font-size:12px;letter-spacing:.06em;color:#667085;font-weight:600;margin:0 0 8px">WHAT YOU WROTE</div>
       <div style="border-left:3px solid ${C.accent};background:${C.accentSoft};padding:12px 16px;border-radius:0 8px 8px 0;font-size:15px;line-height:1.5;color:#14171f">${esc(lead.comment)}</div>
     </td></tr>`
  : '';

const stepRows = steps.length
  ? steps.map(([name, text]) => `
      <tr><td style="padding:0 0 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="28" valign="top" style="padding-top:2px"><div style="width:18px;height:18px;border-radius:9px;background:${C.accent};color:#fff;font-size:11px;line-height:18px;text-align:center;font-weight:700">&#10003;</div></td>
          <td style="font-size:15px;line-height:1.5;color:#14171f"><strong>${esc(name)}</strong><br><span style="color:#475467">${esc(text)}</span></td>
        </tr></table>
      </td></tr>`).join('')
  : `<tr><td style="font-size:15px;line-height:1.5;color:#475467">We will reply to your message within 1 business day.</td></tr>`;

const next = urgent ? '' : `
  <tr><td style="padding:0 32px 8px">
    <div style="font-size:12px;letter-spacing:.06em;color:#667085;font-weight:600;margin:0 0 12px">WHAT HAPPENS NEXT</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepRows}</table>
  </td></tr>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(C.subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(C.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
    <tr><td style="background:${C.accent};height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:28px 32px 8px">
      <div style="font-size:15px;font-weight:700;color:#14171f">Lead Intake</div>
    </td></tr>
    <tr><td style="padding:12px 32px 0">
      <span style="display:inline-block;background:${C.accentSoft};color:${C.accent};font-size:11px;font-weight:700;letter-spacing:.08em;padding:5px 10px;border-radius:999px">${C.badge}</span>
    </td></tr>
    <tr><td style="padding:14px 32px 8px">
      <h1 style="margin:0;font-size:24px;line-height:1.3;color:#14171f">${esc(C.title)}</h1>
    </td></tr>
    <tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#475467">${C.intro}</td></tr>
    ${quote}
    ${next}
    <tr><td style="padding:8px 32px 28px;font-size:15px;line-height:1.6;color:#475467">
      Anything else? Just reply to this email.<br><br>The Team
    </td></tr>
    <tr><td style="background:#f9fafb;padding:16px 32px;font-size:12px;line-height:1.5;color:#98a2b3">
      You are getting this because you sent us a message through our contact form.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

const text = [
  `Hi ${first},`, '',
  urgent
    ? 'Your message is marked urgent. A person on our team will contact you within 1 business hour.'
    : 'Thanks for getting in touch. A person will reply within 1 business day.',
  ...(lead.comment ? ['', 'What you wrote:', `"${lead.comment}"`] : []),
  ...(!urgent && steps.length ? ['', 'What happens next:', ...steps.map(([n, t]) => `- ${n}: ${t}`)] : []),
  '', 'Anything else? Just reply to this email.', '', 'The Team',
].join('\n');

// Sandbox: test submissions and example.com addresses never reach a real
// inbox. They go to the sandbox address with the real recipient in the subject.
const sandbox = lead.is_test || /@(example\.(com|org|net)|test\.invalid)$/i.test(lead.email);
const to = sandbox ? $env.LEADCASE_SANDBOX_EMAIL : lead.email;
const subject = sandbox ? `[SANDBOX to ${lead.email}] ${C.subject}` : C.subject;

return [{ json: { to, subject, text, html, sandbox, type: lead.type } }];
