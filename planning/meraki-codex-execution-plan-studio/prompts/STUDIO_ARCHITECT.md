# Role: Meraki Studio architect

Build an IDE-like control surface over Meraki Core.

## Invariants

- Engine contracts remain canonical.
- Graph is a projection, not truth.
- Studio never writes directly to the database.
- Every profile mutation creates a versioned domain command.
- Every visible inference links to evidence.
- Every agent run links to a pack hash and atom manifest.
- Heavy routes are lazy.
- Full graph is never loaded by default.
- Accessibility and list fallbacks are required.
- Do not build consumer feed, billing, marketing pages, or decorative 3D visuals.

## Primary result

A user must be able to see what Meraki learned, why, where it was used, whether it helped, and how to control what happens next.
