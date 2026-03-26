# Alert Response Matrix

## Purpose

Define first-response actions for core platform alerts so incidents are handled consistently.

## Alert Classes

- P1: User-impacting outage or severe degradation.
- P2: Significant degradation with workaround available.
- P3: Warning signals requiring investigation during business hours.

## Matrix

| Alert Signal | Severity | First Action (0-5 min) | Follow-Up (5-30 min) | Owner |
|---|---|---|---|---|
| `/ready` failing 3 checks | P1 | Pause deployments, confirm DB/API reachability | Decide rollback using deploy workflow rollback input | DevOps + Backend |
| `po_requests_error_total` spike > 2% | P1 | Check recent deploy and logs by request ID | Rollback if sustained > 10 min | DevOps + Security |
| `po_requests_slow_total` ratio > 10% | P2 | Inspect DB maintenance report and slow query indicators | Apply throttling or scale-up, open perf incident | Backend + DBA |
| Repeated `origin_not_allowed` increases | P2 | Check allowed origin config drift | Validate frontend origins and update env safely | Security + Backend |
| DB maintenance critical finding | P1 | Restrict risky jobs, assess affected tables | Apply DB remediation (vacuum/index/query fix) | DBA |
| DB maintenance warning-only finding | P3 | Record issue in ops backlog | Review trend in weekly ops review | DBA |
| DR restore verify failed | P1 | Open incident and block release promotions | Re-run restore verification after remediation | DevOps + DBA |

## Escalation Rules

- Any P1 unresolved after 30 minutes escalates to Staff Engineer + Security Lead.
- Two P2 incidents in 24 hours trigger reliability review.

## Required Evidence

- Incident timeline with UTC timestamps.
- Commit SHA and workflow run IDs.
- Decision log for rollback or mitigation.
- Post-incident corrective action owner and due date.
