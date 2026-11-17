// Build alert email (Code node, run once for all items).
// Input: one row from the watchdog query with new + resolved alerts.
const r = $input.first().json;
const opened = r.opened || [];
const resolved = r.resolved || [];

const LABEL = {
  stuck_processing: 'Lead stuck mid-processing',
  received_not_processed: 'Lead received but never finished',
  lead_failed: 'Lead failed',
  count_mismatch: 'Leads Log and Interest Log disagree',
  missing_email: 'Lead processed but no email was sent',
  sheet_not_synced: 'Lead missing from the Google Sheet',
  gmail_down: 'Gmail connection is broken',
  duplicate_slipped: 'Same email processed twice',
};
const line = (a) => `- ${LABEL[a.kind] || a.kind}: ${a.subject_key}${a.details?.note ? ` (${a.details.note})` : ''}`;

const parts = [];
if (opened.length) parts.push(`New problems (${opened.length}):`, ...opened.map(line), '');
if (resolved.length) parts.push(`Fixed since last check (${resolved.length}):`, ...resolved.map(line), '');
parts.push(`Logs: ${$env.LEADCASE_PUBLIC_URL}/logs`, `n8n runs: ${$env.LEADCASE_EDITOR_URL}/home/executions`);

const subject = opened.length
  ? `[Lead intake] ${opened.length} new problem${opened.length > 1 ? 's' : ''}: ${LABEL[opened[0].kind] || opened[0].kind}`
  : `[Lead intake] All clear (${resolved.length} fixed)`;

return [{ json: { to: (r.recipients || []).join(','), subject, text: parts.join('\n'), opened_ids: opened.map((a) => a.id), resolved_ids: resolved.map((a) => a.id) } }];
