// Feeds made-up summaries to the real "Check summary" code and shows what it flags.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../n8n/code/check-summary.js', 'utf8');
const facts = { leads: 21, urgent: 6, welcome: 15, interest_rows: 29, failed: 1, duplicates_skipped: 6,
  leads_with_no_interests: 2, all_interests: ['API', 'Docs', 'Support', 'Training'],
  top_interests: [{ interest: 'Docs', leads: 17 }, { interest: 'API', leads: 6 }] };
function run(text) {
  const $ = () => ({ first: () => ({ json: { facts } }) });
  const $input = { first: () => ({ json: { content: [{ type: 'text', text }], model: 'test' } }) };
  return new Function('$', '$input', src)($, $input)[0].json.check;
}
const cases = {
  'correct summary': 'The log shows 21 leads, 6 urgent and 15 welcome. Docs leads with 17. 1 lead failed and 6 duplicates were skipped.',
  'wrong count': 'The log shows 22 leads, 6 urgent and 15 welcome.',
  'invented percentage': 'About 29% of leads were urgent.',
  'number as a word': 'Seven leads were urgent.',
  'made-up interest': 'Most leads asked about Billing and Docs.',
};
for (const [name, text] of Object.entries(cases)) {
  const c = run(text);
  console.log(`${c.passed ? 'PASSED' : 'FLAGGED'}  ${name}${c.issues.length ? '  -> ' + c.issues.join(' | ') : ''}`);
}
