# breaking-change

**Directive:** Flag any change that an existing, well-behaved API client could
observe as a break. A break is the removal, rename, retype, or tightening of
anything the client already depends on: a route, HTTP method, path/query param,
request or response field, enum value, status code, or error shape. Removing a
field, renaming it, changing its type, making an optional field required, or
rejecting input that used to be accepted are all breaks. Adding a new *optional*
field, a new route, or a new optional param is NOT a break — do not flag additive,
backward-compatible changes here.

When you flag a break, name the exact path/field and the before→after shape, and
state the client-observable consequence. Report it CRITICAL only when it ships with
no new version or deprecation cover.

## Bad — silent breaking rename of a response field

```diff
 function serializeUser(u: User) {
   return {
     id: u.id,
-    fullName: u.fullName,
+    name: u.fullName,
     email: u.email,
   };
 }
```

Every client reading `user.fullName` now gets `undefined`. The field was renamed
in place with no version bump and no deprecation — this is a breaking change.

## Good — additive, backward-compatible

```diff
 function serializeUser(u: User) {
   return {
     id: u.id,
     fullName: u.fullName,
+    // new field; old clients ignore it, existing fields untouched
+    displayName: u.displayName ?? u.fullName,
     email: u.email,
   };
 }
```

`fullName` is preserved, so existing clients keep working; `displayName` is a new
optional field. No client breaks. Not a finding.
