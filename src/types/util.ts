export type Default<Value, Expect, Default> = Value extends Expect ? Value : Default
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never

export type Get<Object, Key, Default = undefined> = Key extends keyof Object ? Object[Key] : Default
export type GetPath<Object, Path, Default = undefined> = Path extends `${infer Next}/${infer Rest}`
    ? GetPath<Get<Object, Next, Default>, Rest, Default>
    : Get<Object, Path, Default>

export type Deref<Base, Cursor> = Cursor extends { $ref: `#/${infer Path}` } ? GetPath<Base, Path> : Cursor

export type OptionalUndefined<Object> = {
    [K in keyof Object as undefined extends Object[K] ? never : K]: Object[K]
} & {
    [K in keyof Object as undefined extends Object[K] ? K : never]?: Object[K]
}

export type OptionalEmpty<Object> = {
    [K in keyof Object as {} extends Object[K] ? never : K]: Object[K]
} & {
    [K in keyof Object as {} extends Object[K] ? K : never]?: Object[K]
}

export type ToNumber<String> = String extends `${infer N extends number}` ? N : never

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type StatusBlock = 1 | 2 | 3 | 4 | 5
export type StatusDefault = -1

/** Leading block digit of a 3-digit HTTP status code, e.g. `404` -> `4`. */
export type BlockOf<N> = `${N & number}` extends `${infer D extends StatusBlock}${Digit}${Digit}` ? D : never

/** Expand a block digit into its 100 literal status codes, e.g. `2` -> `200 | 201 | ... | 299`. */
export type ExpandBlock<D> = D extends StatusBlock ? ToNumber<`${D}${Digit}${Digit}`> : never
