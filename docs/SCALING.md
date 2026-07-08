# Scaling Notes

This MVP is now structured so the phone app can stay thin:

- Expo Go app stores chat history and memory facts locally; usage state syncs to the backend.
- Render backend owns chat inference proxying and request guardrails.
- Cloudflare Worker owns web search, source fetching, and short-lived caching.

## Already In Place

- Backend request validation and payload caps.
- Per-device plus IP rate limiting.
- Backend concurrency guard for upstream inference.
- Upstream timeout and retry handling.
- Worker search cache for repeated live-info queries.
- Worker fallbacks for date/time, weather, World Cup, and OpenAI news.
- No Privatemode API key in the mobile app.

## Before Thousands Of Users

- Move backend rate limits from process memory to shared storage such as Redis or Upstash.
- Put the backend behind autoscaling with at least two instances.
- Track p50/p95 latency, upstream error rate, search cache hit rate, and active streams.
- Add structured logs with request IDs across app, backend, and Worker.
- Add per-plan quotas on the backend, not only in local app storage.
- Add App Store receipt validation before enabling Pro server-side.
- Add alerting for backend `/ready`, Worker `/health`, and upstream 5xx spikes.

## Suggested Production Defaults

- `MAX_CONCURRENT_UPSTREAM=12` per backend instance to start.
- `RATE_LIMIT_MAX=20` per minute for free users until server-side plans exist.
- `UPSTREAM_TIMEOUT_MS=90000`.
- Worker cache TTLs: 60 seconds for sports/weather/current facts, 180 seconds for news, 900 seconds for stable searches.

The current code is a good MVP foundation. The biggest remaining scale risk is paid entitlement validation: the shared usage store now lives server-side, but real subscriptions still need App Store receipt verification and a durable user identity layer.
