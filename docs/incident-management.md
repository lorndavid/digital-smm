# DigitalSMM — Incident Management

## Priorities

| Priority | Examples | Telegram |
|---|---|---|
| P1 — Critical | production API down, payment system down, database down | ✅ immediate |
| P2 — High | major SMM provider down, high error rate, deploy rollback | ✅ |
| P3 — Medium | single provider degraded, high latency | selected |
| P4 — Low | non-critical frontend error | ❌ never |

## How incidents are created

Operational failures flow through `services/monitoring/alert.service.ts`:

```
Event → classify (error category) → severity → incident (Mongo) → Telegram
```

Repeated identical failures **update the same incident** (key = `service:event`)
by incrementing `occurrences` and refreshing `lastSeenAt` — they never create
thousands of documents.

## Lifecycle

- `open` — first detection
- `investigating` — someone is working it (status reserved for future use;
  currently incidents are `open` until resolved)
- `resolved` — via the admin panel (Incidents → Resolve) or the recovery
  path `resolveAlert(key, reason)` in code

Resolving records `resolvedAt` + `resolutionReason`. A new occurrence after
resolution starts a fresh incident.

## Where to see them

- **Admin:** `/admin/system/incidents` (nav → System → Incidents) — filter by
  status, severity, search; resolve inline. Auto-refreshes every 30s.
- **API:** `GET /api/admin/system/incidents` (admin JWT required),
  `POST /api/admin/system/incidents/:id/resolve`
- **Daily report:** open-incident count + overall HEALTHY/DEGRADED status.

## Recovery notifications

When a serious failure clears (e.g. a deploy that failed then rolled back
successfully), the system sends a 🟢 recovery message so operators know the
issue is over — not just that it started.

## Audit trail

Sensitive admin actions (admin create/role changes, bulk service edits,
order re-placement) are already written to `audit_logs` and visible at
Admin → Admins & Roles → audit logs. Incidents and deployments add the
operational side of the trail.
