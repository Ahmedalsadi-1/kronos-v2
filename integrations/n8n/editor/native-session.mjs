export function createNativeSession(createStores, registrations) {
  const stores = createStores();
  const registered = new Set();
  return {
    stores,
    prepare() {
      for (const [name, register] of Object.entries(registrations)) {
        if (registered.has(name)) continue;
        register();
        registered.add(name);
      }
    },
  };
}
