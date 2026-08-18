# SMM Provider Integration

Configure the SMM order-fulfilment provider from **Admin → Integrations →
SMM Provider** instead of (or in addition to) the `SMMWIZ_API_KEY` environment
variable.

| Field            | Type     | Notes                                              |
|------------------|----------|----------------------------------------------------|
| Provider Name    | text     | Display name, e.g. `wizsmm`.                       |
| API Base URL     | url      | e.g. `https://wizsmm.com/api/v2` (editable).       |
| API Key          | secret   | Encrypted at rest; masked after save.              |

---

## Admin workflow

1. Open **Admin → Integrations → SMM Provider**.
2. Enter the provider name, API base URL and API key.
3. **Save Changes**.
4. **Test API Connection** — the backend decrypts the key in memory, calls the
   provider's `balance` action (read-only), measures latency, and stores the
   result. On success the UI shows the response time and, when the provider
   returns it, the account balance.
5. The connection status, latency and history appear on the detail page and the
   dashboard **Integration Health** widget.

---

## Adapter

The adapter (`backend/src/services/integrations/adapters/smm.adapter.ts`)
reuses the production wizsmm client (`services/smm/smmwiz.provider.ts`) with
credentials from the encrypted integration store instead of environment
variables. The full provider interface (`createOrder`, `getOrderStatus`,
`refill`, `cancel`, …) stays available via `getSmmClient()` for future runtime
use.

The test only ever hits the safest read-only endpoint (`balance`). Runtime
order placement continues to flow through the existing order service, which
uses the env-configured provider (`SMM_PROVIDER` / `SMMWIZ_API_KEY`). Adopting
the admin-managed credential for live order placement is a documented
future step — the adapter interface already supports it.

---

## Normalized error messages

| Error code            | Typical cause                                  |
|------------------------|------------------------------------------------|
| `INVALID_CREDENTIALS` | Provider rejected the API key (HTTP 401 / "Incorrect API key"). |
| `RATE_LIMITED`        | Provider throttled the request.                |
| `TIMEOUT`             | Provider did not respond within 30s.           |
| `NETWORK_ERROR`       | VPS cannot reach the provider host.            |
| `PROVIDER_UNAVAILABLE`| Provider returned 5xx.                         |

The raw provider message is never shown verbatim — error codes + a generic
message go to the UI, because provider responses can echo credential fragments.
