# deprecation-policy

**Directive:** Contract surfaces must be *deprecated before they are deleted*, never
removed outright. When a route, field, or param is being retired, the change should
(1) keep the old surface working during a transition window, (2) mark it deprecated
in a way clients can detect — a `Deprecation`/`Sunset` header, a documented notice,
or a logged warning — and (3) point to the replacement. Flag any diff that deletes
or hard-disables an existing surface in a single step with no deprecation phase, and
flag deprecations that give no sunset signal or migration path.

## Bad — route deleted with no deprecation phase

```diff
- app.get('/users/:id/profile', getProfileHandler);   // removed outright
+ app.get('/users/:id/card', getCardHandler);          // replacement
```

The old `/profile` route is deleted in the same change that adds `/card`. Any client
still calling `/profile` gets a 404 immediately — no transition window, no signal,
no migration note. This violates the deprecation policy.

## Good — deprecate, signal, then plan removal

```diff
  app.get('/users/:id/profile', (req, reply) => {
+   reply.header('Deprecation', 'true');
+   reply.header('Sunset', 'Wed, 31 Dec 2025 23:59:59 GMT');
+   reply.header('Link', '</users/:id/card>; rel="successor-version"');
    return getProfileHandler(req, reply);   // still works during the window
  });
+ app.get('/users/:id/card', getCardHandler);   // replacement available now
```

The old route keeps working, advertises its deprecation and sunset date, and points
clients to the successor. Removal happens in a later release after the window. Not a
finding.
