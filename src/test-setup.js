// Polyfill for localStorage required by msw in Node.js environment
const store = new Map()

globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get length() {
        return store.size
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
}
