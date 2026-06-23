# semver-discipline

**Directive:** API changes must be labeled at the right semver level. A breaking
change (removal/rename/retype/stricter validation of an existing contract surface)
requires a **major** bump or a new versioned route (`/v2/...`). A backward-compatible
addition is a **minor**. A bug fix that does not touch the contract is a **patch**.
Flag any change where the version label understates the impact: a breaking change
released as a minor or patch, or a breaking edit made in place on an existing
version with no new version to absorb it. The point is that clients pin on a version
and trust that within it nothing breaks.

## Bad — breaking change shipped as a patch

```diff
 // package.json
-  "version": "2.4.1",
+  "version": "2.4.2",   // ← patch bump

 // routes/payments.ts  (still mounted at /v2)
-  app.post('/v2/charge', { body: { amountCents: z.number() } }, ...)
+  app.post('/v2/charge', { body: { amount: z.number() } }, ...) // renamed field
```

A required request field was renamed on the existing `/v2` route, but the version
moved `2.4.1 → 2.4.2` — a patch. Clients on `^2.4.1` will auto-upgrade and break.
The label understates a breaking change.

## Good — breaking change behind a new version

```diff
 // package.json
-  "version": "2.4.1",
+  "version": "3.0.0",   // ← major bump for the break

 // /v2 kept intact for existing clients; new shape lives on /v3
   app.post('/v2/charge', { body: { amountCents: z.number() } }, ...)
+  app.post('/v3/charge', { body: { amount: z.number() } }, ...)
```

The breaking rename lives on a new `/v3` route, `/v2` is untouched, and the package
takes a major bump. Existing clients are unaffected; the version honestly reflects
the change. Not a finding.
