# KronTerm OS — Phase Dependencies

```text
Architecture and live identity
    ↓
System services and typed actions
    ↓
Layout v4 migration and restoration
    ↓
Shared System UI + native appearance
    ↓
Connected shell + integrated window chrome
    ├── Files and Canvas
    ├── Activity and Control Centers
    ├── Kronos inspector
    └── Native App Stream states
    ↓
Responsive overflow + flat overview
    ↓
Accessibility, performance, and regression qualification
```

## Ordering rules

- Never style duplicate application implementations; establish live identity first.
- Never add surface-specific launch logic; route through the app registry first.
- Never add translucent materials without reduced-transparency fallback.
- Never ship layout changes without v3→v4 preservation tests.
- Never enable the System UI by default without the rollback gate and 1280×800 validation.

## Verification

```bash
task check:ts
npx vitest run frontend/app/tab/os-workspace-model.test.ts
npm test -- --run
go test ./pkg/...
npm --prefix mcp-kron-term run test
```

Run `task package` only after targeted and full regression suites pass.
