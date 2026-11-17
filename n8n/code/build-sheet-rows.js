// Build sheet rows (Code node, run once for all items).
// One Sheets API batchUpdate with an appendCells request per tab, so a lead
// lands in all three tabs together or not at all.
const data = $('Get lead').first().json.data;
const tabs = Object.fromEntries(($input.first().json.sheets || []).map((s) => [s.properties.title, s.properties.sheetId]));
for (const t of ['Leads', 'Interest Log', 'Leads Log']) {
  if (tabs[t] === undefined) throw new Error(`Sheet tab "${t}" not found`);
}

const s = (v) => ({ userEnteredValue: { stringValue: String(v ?? '') } });
const num = (v) => ({ userEnteredValue: { numberValue: Number(v) } });
const ts = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
const append = (title, rows) => ({ appendCells: { sheetId: tabs[title], rows: rows.map((values) => ({ values })), fields: 'userEnteredValue' } });

const lead = data.lead;
const requests = [
  // Leads: every submission, duplicates included, exactly as received.
  append('Leads', [[s(ts(lead.received_at)), s(lead.full_name), s(lead.email_raw), s(lead.comment), s(lead.interests_raw), s(lead.utm_source)]]),
];
if (data.log) {
  if (data.interests.length) {
    requests.push(append('Interest Log', data.interests.map((i) => [s(ts(lead.received_at)), s(lead.email), s(i)])));
  }
  requests.push(append('Leads Log', [[s(lead.email), s(data.log.type), num(data.log.interests_count)]]));
}
return [{ json: { requests } }];
