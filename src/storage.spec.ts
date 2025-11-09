const store: Record<string, string> = {}
const actions: Storage = {
    key: (index: number) => Object.keys(store)[index] ?? null,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => void (store[key] = `${value}`),
    removeItem: (key: string) => delete store[key],
    clear: () => Object.keys(store).forEach(key => delete store[key]),
    get length() {
        return Object.keys(store).length
    },
}

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.getItem !== 'function')
    globalThis.localStorage = actions
