// Check summary (Code node, run once for all items).
// Don't trust the AI's numbers. Every number in its text must be a number
// that actually exists in the facts we gave it, and every interest it names
// must be a real interest. If not, the page shows "Check failed" and why.
const facts = $('Get facts').first().json.facts;
const res = $input.first().json;
const summary = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim();

const issues = [];
if (!summary) issues.push('The model returned no text.');

// All numbers that appear anywhere in the facts.
const allowed = new Set();
(function walk(v) {
  if (typeof v === 'number') allowed.add(String(v));
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
})(facts);

// Numbers written as words count too.
const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, twenty: 20, half: null };
const found = [];
for (const m of summary.matchAll(/\b\d+(?:\.\d+)?%?/g)) found.push(m[0]);
for (const m of summary.toLowerCase().matchAll(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\b/g)) {
  found.push(String(WORDS[m[1]]));
}
for (const n of found) {
  if (n.endsWith('%')) issues.push(`Uses a percentage (${n}) that is not in the data.`);
  else if (!allowed.has(String(Number(n)))) issues.push(`Number ${n} is not in the data.`);
}

// Interest names it mentions must exist (catches made-up categories).
const known = new Set((facts.all_interests || []).map((i) => i.toLowerCase()));
for (const m of summary.matchAll(/\b(API|Docs|Support|Training|Billing|Sales|Pricing|Integrations?|Onboarding)\b/g)) {
  if (known.size && !known.has(m[1].toLowerCase())) issues.push(`Mentions "${m[1]}", which is not an interest in the logs.`);
}

return [{
  json: {
    summary: summary || 'No summary available.',
    facts,
    check: { passed: issues.length === 0, issues: [...new Set(issues)], numbers_checked: found.length },
    model: res.model || 'unknown',
    generated_at: new Date().toISOString(),
  },
}];
