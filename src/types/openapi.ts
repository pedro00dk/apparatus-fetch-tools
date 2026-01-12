import * as H from 'hotscript'
import { ToNumber } from 'hotscript/dist/internals/numbers/impl/utils'
import { ClientSpec } from './client'
import {
    Default,
    Deref,
    Get,
    GetOr,
    H_If,
    H_IsSubType,
    H_IsSuperType,
    H_Union_Include,
    OptionalUndefined,
    Prettify,
} from './util'

/**
 * Convert OpenAPI Specification type to a `ClientSpec` type.
 *
 * @param OpenApiSpec The OpenAPI Specification type to convert.
 * @param Strict Ensure the result matches ClientSpec. More precise but impacts performance, use for checking only.
 */
export type FromOpenApiSpec<OpenApiSpec, Strict extends boolean = false> = Prettify<
    Strict extends false
        ? ResolvePaths<Deref<Get<OpenApiSpec, 'paths'>, OpenApiSpec>>
        : ResolvePaths<Deref<Get<OpenApiSpec, 'paths'>, OpenApiSpec>> extends infer ResolvedPaths extends ClientSpec
          ? ResolvedPaths
          : never
>

type ResolvePaths<Paths> = {
    [Path in keyof Paths]: {
        [Method in keyof Paths[Path]]: OptionalUndefined<{
            path: H.Pipe<Paths[Path][Method], [H.Objects.Get<'parameters'>, ParametersToObject<'path'>]>
            header: H.Pipe<Paths[Path][Method], [H.Objects.Get<'parameters'>, ParametersToObject<'header'>]>
            cookie: H.Pipe<Paths[Path][Method], [H.Objects.Get<'parameters'>, ParametersToObject<'cookie'>]>
            query: H.Pipe<Paths[Path][Method], [H.Objects.Get<'parameters'>, ParametersToObject<'query'>]>
            request: H.Pipe<Paths[Path][Method], [H.Objects.Get<'requestBody'>, BodyToObject<'request'>]>
        }> & {
            responses: H.Call<ResponsesToObject, Get<Paths[Path][Method], 'responses'>>
            fallback: NonNullable<
                H.Call<BodyToObject<'response'>, GetOr<Get<Paths[Path][Method], 'responses'>, 'default', unknown>>
            >
        }
    }
}

interface ParametersToObject<In> extends H.Fn {
    return: H.Pipe<
        this['arg0'],
        [
            H.Tuples.Filter<H.Booleans.Extends<{ in: In }>>, //
            H.Tuples.Map<ParameterToObject>,
            H.Tuples.ToIntersection,
            H_If<H_IsSuperType<unknown>, H.Constant<{ [_ in string]: never }>>,
            H_If<H_IsSuperType<{ [_ in string]: never }>, H_Union_Include<undefined>>,
        ]
    >
}

interface ParameterToObject extends H.Fn {
    return: H.Pipe<
        this['arg0'],
        [
            H.Objects.Get<'schema'>,
            SchemaToObject,
            H.Objects.Record<Get<this['arg0'], 'name'> & string>,
            H_If<
                H.Booleans.Extends<this['arg0'], { explode: true }>,
                H.Objects.Get<Get<this['arg0'], 'name'> & string>
            >,
            H.Objects.Partial,
            H_If<H.Booleans.Extends<this['arg0'], { required: true } | { in: 'path' }>, H.Objects.Required>,
        ]
    >
}

interface ResponsesToObject extends H.Fn {
    return: H.Pipe<
        this['arg0'],
        [H.Objects.MapKeys<ResponseKeyToNumber>, H.Objects.MapValues<BodyToObject<'response'>>]
    >
}

interface ResponseKeyToNumber extends H.Fn {
    return: this['arg0'] extends `${infer Status extends number}`
        ? Status
        : this['arg0'] extends `${infer Status extends 1 | 2 | 3 | 4 | 5}XX`
          ? ToNumber<`${Status}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`>
          : never
}

interface BodyToObject<In> extends H.Fn {
    return: H.Pipe<
        this['arg0'],
        [
            H.Objects.Get<'content'>,
            H.Objects.Values,
            H.Unions.Map<H.Objects.Get<'schema'>>,
            H.Unions.Map<SchemaToObject>,
            In extends 'response'
                ? H.Identity
                : this['arg0'] extends { required: true }
                  ? H.Identity
                  : H_Union_Include<undefined>,
            H_If<H_IsSubType<never>, H.Constant<undefined>>,
        ]
    >
}

interface SchemaToObject extends H.Fn {
    return: (this['arg0'] extends { nullable: true } ? null | undefined : never) | this['arg0'] extends true
        ? unknown
        : this['arg0'] extends false
          ? never
          : this['arg0'] extends { const: infer Const }
            ? Const
            : this['arg0'] extends { enum: (infer Item)[] }
              ? Item
              : this['arg0'] extends { type: 'null' }
                ? null
                : this['arg0'] extends { type: 'boolean' }
                  ? boolean
                  : this['arg0'] extends { type: 'number' | 'integer' }
                    ? number
                    : this['arg0'] extends { type: 'string' }
                      ? string
                      : this['arg0'] extends { type: 'array'; items: infer Items }
                        ? H.Call<SchemaToObject, Items>[]
                        : this['arg0'] extends (
                                | { type: 'object'; properties?: infer Properties }
                                | { type?: never; properties: infer Properties }
                                | { type?: never; additionalProperties: infer Additional }
                            ) & { required?: infer Required; additionalProperties?: infer Additional }
                          ? {
                                [K in keyof Properties as K extends Default<Required, string[], []>[number]
                                    ? K
                                    : never]: H.Call<SchemaToObject, Properties[K]>
                            } & {
                                [K in keyof Properties as K extends Default<Required, string[], []>[number]
                                    ? never
                                    : K]?: H.Call<SchemaToObject, Properties[K]>
                            } & (unknown extends Additional
                                    ? unknown
                                    : { [_: string]: H.Call<SchemaToObject, Additional> })
                          : this['arg0'] extends { allOf: [infer Head, ...infer Tail] }
                            ? H.Call<SchemaToObject, Head> & H.Call<SchemaToObject, { allOf: Tail }>
                            : this['arg0'] extends { anyOf: (infer Item)[] }
                              ? H.Call<SchemaToObject, Item>
                              : this['arg0'] extends { oneOf: (infer Item)[] }
                                ? H.Call<SchemaToObject, Item>
                                : this['arg0'] extends { type: (infer Item)[] }
                                  ? H.Call<SchemaToObject, { type: Item } & Omit<this['arg0'], 'type'>>
                                  : unknown
}

/**
 * Simplified version of OpenAPI Specification Types for reference.
 *
 * It includes only the parts relevant (or might be) for type-safe API client generation.
 * Based on OpenAPI Specification 3.2.0 but also includes properties from 3.0.x and 3.1.x.
 *
 * The types are actually not used for type checking and serve only as a guide for the transformation logic, as extends
 * checks of complex properties are expensive and affect performance of the type system and auto-completion in editors.
 *
 * For full specification, see: https://spec.openapis.org/oas/v3.2.0
 */
//@ts-ignore
type OpenApiSpec = {
    openapi: `3.${number}.${number}`
    servers?: { url: string }[]
    paths?: { [path in string]: Path }
}

type Path = {
    $ref?: string
    get?: Operation
    put?: Operation
    post?: Operation
    delete?: Operation
    options?: Operation
    head?: Operation
    patch?: Operation
    trace?: Operation
    query?: Operation
    additionalOperations?: { [_ in string]: Operation }
    parameters?: (Parameter | Reference)[]
}

type Operation = {
    parameters?: (Parameter | Reference)[]
    requestBody?: RequestBody | Reference
    responses?: { [_ in string]: ResponseBody }
}

type Parameter = {
    name: string
    in: 'query' | 'header' | 'path' | 'cookie' | 'querystring'
    required?: boolean
    explode?: boolean
    schema?: Schema | Reference
}

type RequestBody = {
    content: { [_ in `${string}/${string}`]: MediaType }
    required?: boolean
}

type ResponseBody = {
    description?: string
    headers?: { [_ in string]: Omit<Parameter, 'name' | 'in'> | Reference }
    content?: { [_ in string]: MediaType }
}

type MediaType = {
    schema?: Schema | Reference
    itemSchema?: Schema | Reference
}

type Reference = {
    $ref: string
}

type SchemaType = 'null' | 'boolean' | 'number' | 'integer' | 'string' | 'array' | 'object'

type Schema =
    | boolean
    | {
          $ref?: string
          $defs?: { [_ in string]: Schema | Reference }
          nullable?: boolean
          const?: unknown
          enum?: unknown[]
          type?: SchemaType | SchemaType[]
          format?: string

          // logical
          allOf?: (Schema | Reference)[]
          anyOf?: (Schema | Reference)[]
          oneOf?: (Schema | Reference)[]
          not?: Schema | Reference

          // conditional
          if?: Schema | Reference
          then?: Schema | Reference
          else?: Schema | Reference

          // arrays
          items?: Schema | Reference

          // objects
          required?: string[]
          properties?: { [_ in string]: Schema | Reference }
          additionalProperties?: Schema | Reference | boolean
      }
