# response-schema

**Directive:** The response a route returns must match its declared/typed schema and
stay consistent with sibling endpoints. Flag drift where the serializer returns a
shape that no longer matches the route's response type, where nullability or types
diverge from the schema, or where two endpoints that represent the same resource
return it differently (e.g. `created_at` as an ISO string in one place and a Unix
number in another). Also flag a scalar that becomes an object, or an object that
becomes an array, without a version change. Consistency of the *shape* is the
contract, independent of whether a specific field was renamed.

## Bad — serializer drifts from the declared schema

```ts
// declared contract
const OrderResponse = z.object({
  id: z.string(),
  total: z.number(),        // dollars, number
  items: z.array(Item),
});

// serializer now returns a different shape
function serializeOrder(o: Order) {
  return {
    id: o.id,
    total: `$${o.total.toFixed(2)}`, // ← now a string, not a number
    items: o.items.length,           // ← now a count, not the array
  };
}
```

`total` changed `number → string` and `items` changed `Item[] → number`. The
response no longer matches `OrderResponse`; any client decoding against the schema
fails. Flag both drifts.

## Good — serializer matches the schema exactly

```ts
const OrderResponse = z.object({
  id: z.string(),
  total: z.number(),
  items: z.array(Item),
});

function serializeOrder(o: Order): z.infer<typeof OrderResponse> {
  return {
    id: o.id,
    total: o.total,
    items: o.items.map(serializeItem),
  };
}
```

The return type is pinned to the schema and every field matches its declared type.
No drift. Not a finding.
