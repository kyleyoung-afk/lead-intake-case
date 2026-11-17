// Canvas layout for each workflow: node positions in clear lanes plus sticky
// notes that label each section. Purely visual; no effect on behaviour.
const X = (i) => i * 240;
// Sticky colours in n8n: 1 yellow, 2 orange/red, 3 pink, 4 green, 5 blue, 6 purple, 7 grey
export const LAYOUT = {
  'Lead Intake: Form to Logs': {
    pos: {
      'Form submitted': [X(0), 0], 'Clean input': [X(1), 0], 'Add to Leads': [X(2), 0],
      'Same request twice?': [X(3), 0], 'Claim email': [X(4), 0], 'Already processed?': [X(5), 0],
      'Write Interest Log': [X(6), 0], 'Build email': [X(7), 0], 'Send email': [X(8), 0],
      'Write Leads Log': [X(9), 0], 'Mirror lead to sheet': [X(10), 0], 'Respond: processed': [X(11), 0],
      'Respond: same request': [X(4), -340],
      'Mark duplicate': [X(6), -340], 'Mirror duplicate to sheet': [X(7), -340], 'Respond: skipped': [X(8), -340],
      'Respond: bad input': [X(2), 300],
      'Describe failure': [X(6), 300], 'Mark failed': [X(7), 300], 'Respond: failed': [X(8), 300],
      'Fail the run (fires alert)': [X(9), 300],
    },
    notes: [
      { x: -80, y: -140, w: 760, h: 300, color: 5, text: '## 1. Clean and save\nNormalize email + interests, decide urgent vs welcome.\nEvery submission goes into **Leads**, duplicates included.' },
      { x: 680, y: -140, w: 720, h: 300, color: 6, text: '## 2. Already processed?\nOne atomic insert into **Leads Log** (email is the key).\nDouble clicks and simultaneous submits cannot both win.' },
      { x: 1400, y: -140, w: 1520, h: 300, color: 4, text: '## 3. Process the lead\nOne **Interest Log** row per interest, send the Urgent or Welcome email, finish the **Leads Log** row (email, type, interests_count), copy to the Google Sheet.' },
      { x: 880, y: -480, w: 1260, h: 260, color: 7, text: '## Duplicate: skip\nSame request twice, or email already processed. Logged, nothing sent.' },
      { x: 400, y: 180, w: 320, h: 260, color: 2, text: '## Bad input\nReturns 400' },
      { x: 1400, y: 180, w: 1000, h: 260, color: 2, text: '## Something broke\nMark the lead **failed** with the reason, tell the form, then fail the run so **Error Alerts** emails right away. Resubmitting retries it.' },
    ],
  },
  'Lead Intake: Mirror to Sheet': {
    pos: {
      'When called with a lead id': [X(0), 0], 'Get lead': [X(1), 0], 'Get tab ids': [X(2), 0],
      'Build sheet rows': [X(3), 0], 'Append to sheet': [X(4), 0], 'Mark synced': [X(5), 0],
    },
    notes: [
      { x: -80, y: -180, w: 1360, h: 340, color: 5, text: '## Copy one lead to the Google Sheet\nPostgres is the source of truth. This copies a lead into the **Leads**, **Interest Log** and **Leads Log** tabs in ONE Sheets API call, so a lead lands in all tabs together or not at all.\nIf it fails, the Watchdog notices and retries.' },
    ],
  },
  'Lead Intake: Logs Summary': {
    pos: {
      'Summary requested': [0, 0], 'Get facts': [240, 0], 'Ask Claude': [560, 0],
      'Check summary': [880, 0], 'Respond: summary': [1120, 0], 'Respond: summary failed': [1120, 280],
    },
    notes: [
      { x: -80, y: -200, w: 480, h: 360, color: 5, text: '## 1. Facts from SQL\nThe database works out every number. The AI never does math.' },
      { x: 420, y: -200, w: 320, h: 360, color: 6, text: '## 2. Words from Claude\nTurns the facts into 2-3 plain sentences.' },
      { x: 760, y: -200, w: 560, h: 360, color: 4, text: '## 3. Check the AI\nEvery number and interest it mentions must exist in the facts, or the page shows **Check failed**.' },
    ],
  },
  'Lead Intake: Watchdog': {
    pos: {
      'Every 15 minutes': [X(0), 0], 'Check Gmail connection': [X(1), 0], 'Find problems': [X(2), 0],
      'Anything to report?': [X(3), 0], 'Build alert email': [X(4), 0], 'Send alert': [X(5), 0],
      'Mark alerts sent': [X(6), -100], 'Record alert send failure': [X(6), 100],
      'Leads to re-sync': [X(3), 400], 'Re-sync to sheet': [X(4), 400],
    },
    notes: [
      { x: -80, y: -220, w: 760, h: 380, color: 5, text: '## Look for quiet failures\nStuck or failed leads, Leads Log vs Interest Log mismatches, missing emails, leads not in the sheet, Gmail disconnected.' },
      { x: 680, y: -220, w: 1080, h: 480, color: 6, text: '## Tell people once\nNew problems email the alert list once. When a problem is gone, an **all clear** is sent.' },
      { x: 680, y: 280, w: 560, h: 260, color: 4, text: '## Self-heal\nLeads missing from the sheet get copied again.' },
    ],
  },
  'Lead Intake: Error Alerts': {
    pos: { 'Error Trigger': [X(0), 0], 'Log error': [X(1), 0], 'Email the alert list': [X(2), 0] },
    notes: [
      { x: -80, y: -180, w: 760, h: 340, color: 2, text: '## Any crash, any workflow\nSaves the error, then emails the alert list with the workflow, the step that broke, the error and a link to the failed run.' },
    ],
  },
};

export function applyLayout(wf) {
  const L = LAYOUT[wf.name];
  if (!L) return wf;
  for (const n of wf.nodes) if (L.pos[n.name]) n.position = L.pos[n.name];
  (L.notes || []).forEach((s, i) => wf.nodes.push({
    id: `note-${i + 1}`, name: `Note ${i + 1}`, type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
    position: [s.x, s.y], parameters: { content: s.text, width: s.w, height: s.h, color: s.color },
  }));
  return wf;
}
