import * as H from 'hotscript'
import { ToNumber } from 'hotscript/dist/internals/numbers/impl/utils'

export type Prettify<T> = T extends string | number | boolean | symbol | null | undefined
    ? T
    : T extends object
      ? { [K in keyof T]: Prettify<T[K]> } & unknown
      : T

export type Get<Object, Key> = Key extends keyof Object ? Object[Key] : undefined
export type GetOr<Object, Key, Default> = Key extends keyof Object ? Object[Key] : Default
export type GetDeep<Base, Path> = Path extends `${infer Next}/${infer Rest}`
    ? GetDeep<Get<Base, Next>, Rest>
    : Get<Base, Path>

export type Deref<Cursor, Base = Cursor> = Cursor extends { $ref: `#/${infer Path}` }
    ? Deref<GetDeep<Base, Path>, Base>
    : Cursor extends object
      ? { [K in keyof Cursor]: Deref<Cursor[K], Base> }
      : Cursor

export type Default<Value, Expect, Default> = Value extends Expect ? Value : Default

export type OptionalUndefined<Object> = {
    [K in keyof Object as undefined extends Object[K] ? never : K]: Object[K]
} & {
    [K in keyof Object as undefined extends Object[K] ? K : never]?: Object[K]
}

export type ShortStatus<T> = T extends 1
    ? ToNumber<`1${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`>
    : T extends 2
      ? ToNumber<`2${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`>
      : T extends 3
        ? ToNumber<`3${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`>
        : T extends 4
          ? ToNumber<`4${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`>
          : T extends 5
            ? ToNumber<`5${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`>
            : T

//

export interface H_If<Condition extends H.Fn, Then extends H.Fn, Else extends H.Fn = H.Identity> extends H.Fn {
    return: H.Call<Condition, this['arg0']> extends true ? H.Call<Then, this['arg0']> : H.Call<Else, this['arg0']>
}

export interface H_IsSubType<Type> extends H.Fn {
    return: this['arg0'] extends Type ? true : false
}

export interface H_IsSuperType<Type> extends H.Fn {
    return: Type extends this['arg0'] ? true : false
}

export interface H_Tuple_ToArray extends H.Fn {
    return: this['arg0'][]
}

export interface H_Union_Include<Item> extends H.Fn {
    return: this['arg0'] | Item
}
