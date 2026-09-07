# Hosted runtime reconstruction

This tiny exercise is deliberately independent of Meraki production code. It
shows why two stateless request handlers need a shared durable store, why a
revision prevents lost updates, and why an idempotency key makes retries safe.

Run:

```powershell
node learning-lab/hosted-runtime/index.mjs
```
