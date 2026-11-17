# Lead intake: form, automation, logs

A small lead-capture system built for an automation case study.

- **Live app:** https://case.opsharbor.io (form) and https://case.opsharbor.io/logs (logs + AI summary)
- **n8n workflows:** [`n8n/workflows/`](n8n/workflows) (import any file into n8n)

## How it works

```
Form (React)  ->  small backend (checks input, blocks spam, keeps keys secret)
              ->  n8n "Form to Logs" workflow
                    1. clean the data (email, interests, urgent check)
                    2. add a row to Leads (every submission, duplicates included)
                    3. claim the email in Leads Log; if it was already processed, stop
                    4. one Interest Log row per interest
                    5. send the Urgent or Welcome email (Gmail)
                    6. finish the Leads Log row: email, type, interests_count
                    7. copy everything to the Google Sheet
Logs page     ->  reads Postgres, filters by email / interest
              ->  n8n "Logs Summary": SQL works out the numbers, Claude writes
                  2-3 sentences, a check step verifies every number it used
Watchdog      ->  every 15 min looks for quiet failures, emails once, says "all clear"
Error Alerts  ->  any crash in any workflow emails the alert list right away
```

Postgres is the source of truth. The Google Sheet is a mirror for people to read.

## What the sample data showed, and what the build does about it

| In the sample | Handling |
|---|---|
| Anna Taylor appears twice in Leads | "Already processed" is one atomic database step (primary key on email). Double clicks and two submits at the same moment can't create two leads. Leads still keeps every submission. |
| "Api" and "API" logged as different interests | Interests are split on commas, semicolons, slashes and new lines, trimmed, mapped to one spelling, and de-duplicated. |
| "urgent:" and "urgent -" written differently | Urgent is a whole-word match in any case. "Not urgent" counts as welcome. |
| One Interest Log row dated 10 days after its lead | Interest rows take the lead's timestamp, and the watchdog checks Leads Log counts against Interest Log. |
| Interest Log has no header; Leads Log column named differently from the brief | Fixed in the working copy of the sheet (`interests_count`). |
| The brief mentions two email templates that aren't in the sheet | Wrote my own (see `n8n/code/build-email.js`). |
| The brief adds the lead *before* the duplicate check | The check reads Leads Log ("processed"), not Leads, otherwise every lead would look like a repeat. |

## How I know it works

- `tests/run_tests.py`: 14 submissions through the real public URL plus 6 database checks. Test leads only ever email a sandbox inbox.
- Crash test: rename a table mid-run. The lead is marked failed with the reason, an alert is emailed, and resubmitting the same email retries it.
- Watchdog test: plant a stuck lead and a count mismatch. Both are emailed within 15 minutes, then "all clear" once fixed.
- `tests/check_summary_test.cjs`: feeds wrong summaries to the AI check (wrong count, invented percentage, made-up interest). All are flagged.

## Layout

```
app/        React form + logs page, Express backend
db/         Postgres schema
n8n/        workflows (generated), Code node sources, watchdog SQL, generator script
tests/      sandbox tests
deploy/     Apache proxy, firewall rule, workflow push script
```

Runs with Docker Compose: Postgres, n8n and the app on a private network. Only the app is public (behind Cloudflare). n8n is reachable only over a private VPN.
