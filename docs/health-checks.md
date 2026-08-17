# Health Checks

The backend exposes three levels of health checks, kept deliberately separate so
orchestrators and load balancers can probe the right one.

## Endpoints

| Endpoint                 | Type        | Response                                                        |
|--------------------------|-------------|-----------------------------------------------------------------|
| `GET /api/health`        | **Liveness** | `200` whenever the process is up. No dependency checks.         |
| `GET /api/ready`         | **Readiness**| `200` when MongoDB (and Redis, when configured) are reachable; `503` otherwise. |
| `GET /api/health/deps`   | **Dependency detail** | `200` with per-dependency status (never fails the request). |
| `GET /api/health/metrics`| **Metrics** | `200` with request counts, error rate, p50/p95/p99 latency, top routes. |

## Example responses

### `GET /api/health` (liveness)

```json
{
  "status": "ok",
  "service": "digitalsmm-backend",
  "db": "connected",
  "smmProvider": "smmwiz",
  "paymentProvider": "cutluy",
  "time": "2026-08-18T00:00:00.000Z"
}
```

### `GET /api/ready` (readiness)

```json
{
  "status": "ok",
  "service": "digitalsmm-backend",
  "dependencies": {
    "mongodb": "ok",
    "redis": "not-configured"
  },
  "time": "2026-08-18T00:00:00.000Z"
}
```

`redis: "not-configured"` means `REDIS_URL` is empty — the single-instance
deployment uses in-memory stores, so readiness does not depend on it.

### `GET /api/health/deps` (dependency health)

```json
{
  "status": "ok",
  "service": "digitalsmm-backend",
  "version": "1.0.0",
  "uptimeSeconds": 3600,
  "dependencies": {
    "mongodb": { "status": "ok" },
    "redis": { "status": "not-configured" },
    "smmProvider": { "status": "ok", "provider": "smmwiz" },
    "paymentProvider": { "status": "ok", "provider": "cutluy" }
  },
  "time": "2026-08-18T00:00:00.000Z"
}
```

The SMM provider probe is **advisory** — a degraded provider reports
`status: "degraded"` with a truncated error but the endpoint stays `200`, so a
provider hiccup never takes the container down.

## Verifying

```bash
curl -s http://localhost:4000/api/health
curl -s http://localhost:4000/api/ready
curl -s http://localhost:4000/api/health/deps
curl -s http://localhost:4000/api/health/metrics
```

## Docker

`docker-compose.yml` already health-checks the backend against
`GET /api/health` (`fetch('http://127.0.0.1:4000/api/health')`), and the
frontend/admin containers `depends_on` that healthcheck, so the stack boots in
dependency order.

## Orchestration notes

- **Liveness** (`/api/health`) — probe every 15–30s; restart the container when
  it fails repeatedly.
- **Readiness** (`/api/ready`) — probe before routing traffic (Kubernetes
  `readinessProbe`, Nginx upstream checks, etc.).
- **Dependency detail** (`/api/health/deps`) — for humans and dashboards; never
  used to restart anything.
- The endpoints expose **no credentials, URIs with passwords or provider keys**.
