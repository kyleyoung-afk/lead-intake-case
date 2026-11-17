// Build email (Code node, run once for all items).
// The brief says the two templates are in the spreadsheet. They aren't,
// so these are mine. Plain, short, and they say what happens next.
const lead = $('Clean input').first().json;
const first = (lead.full_name.split(' ')[0] || 'there').replace(/[<>&"]/g, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NEXT = {
  API: 'API reference and keys: we will send setup steps for your account.',
  Docs: 'Docs: start with the quick-start guide, it takes about 10 minutes.',
  Support: 'Support: reply to this email any time and it reaches a person.',
  Training: 'Training: we run live onboarding sessions every week, we will send dates.',
};
const lines = lead.interests.map((i) => NEXT[i] || `${i}: we will follow up with what we have on this.`);

let subject, text;
if (lead.type === 'urgent') {
  subject = 'We got your urgent request';
  text = [
    `Hi ${first},`,
    '',
    'Thanks for reaching out. Your message is marked urgent, so a person on our team will contact you within 1 business hour.',
    '',
    'What you wrote:',
    `"${lead.comment}"`,
    '',
    'If anything changes before then, just reply to this email.',
    '',
    'The Team',
  ].join('\n');
} else {
  subject = `Welcome, ${first}`;
  text = [
    `Hi ${first},`,
    '',
    'Thanks for getting in touch. Here is what happens next:',
    '',
    ...(lines.length ? lines.map((l) => `- ${l}`) : ['- We will reply to your message within 1 business day.']),
    '',
    'Questions in the meantime? Reply here.',
    '',
    'The Team',
  ].join('\n');
}

// Sandbox: test submissions and example.com addresses never reach a real
// inbox. They go to the sandbox address with the real recipient in the subject.
const sandbox = lead.is_test || /@(example\.(com|org|net)|test\.invalid)$/i.test(lead.email);
const to = sandbox ? $env.LEADCASE_SANDBOX_EMAIL : lead.email;
if (sandbox) subject = `[SANDBOX to ${lead.email}] ${subject}`;

const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#14171f">${
  esc(text).split('\n').map((l) => (l ? `<p style="margin:0 0 4px">${l}</p>` : '<br>')).join('')
}</div>`;

return [{ json: { to, subject, text, html, sandbox, type: lead.type } }];
