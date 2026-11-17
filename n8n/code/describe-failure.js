// Describe failure (Code node, run once for all items).
// Any step's error output lands here. Turn whatever shape the error has into
// three plain values so "Mark failed" can always record it.
const item = $input.first().json || {};
const err = item.error;
const message = String(
  item.message || (err && (err.message || err.description)) || err || 'unknown error'
).slice(0, 500);

let leadId = 0;
try { leadId = Number($('Add to Leads').first().json.lead_id) || 0; } catch (e) { /* failed before the lead was saved */ }
let email = '';
try { email = $('Clean input').first().json.email || ''; } catch (e) { /* failed before cleaning */ }

let failedStep = 'unknown';
try { failedStep = (err && err.node && err.node.name) || 'unknown'; } catch (e) {}

return [{ json: { lead_id: leadId, email, note: `${failedStep}: ${message}` } }];
