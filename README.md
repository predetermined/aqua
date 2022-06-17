# Aqua

Aqua is a minimal and fast web framework.

## Extending Aqua

```typescript
interface WayCoolerAquaRequest extends AquaRequest {
  isWayCooler: true;
}

const app = Aqua.modify(() => {
  return (...args) => new Aqua<WayCoolerAquaRequest>(...args);
})({ port: 3000 });

app.route("/", Method.GET).respond((req) => {
  req.isWayCooler; // "true"
  return "l";
});
```
