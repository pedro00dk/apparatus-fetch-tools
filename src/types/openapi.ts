import { ClientSpec } from './client'
import { Default, Deref, ExpandBlock, Get, StatusBlock, StatusDefault, UnionToIntersection } from './util'

/**
 * Convert OpenAPI Specification type to a `ClientSpec` type.
 *
 * @param OpenApiSpec The OpenAPI Specification type to convert.
 * @param Strict Ensure the result matches ClientSpec. More precise but impacts performance, use for checking only.
 */
export type FromOpenApiSpec<OpenApiSpec, Strict extends boolean = false> = Strict extends false
    ? ParsePaths<OpenApiSpec, Get<OpenApiSpec, 'paths'>>
    : ParsePaths<OpenApiSpec, Get<OpenApiSpec, 'paths'>> extends infer ResolvedPaths extends ClientSpec
      ? ResolvedPaths
      : never

/**
 * Parse the OpenAPI `paths` map into a `ClientSpec` paths map.
 */
type ParsePaths<Spec, RawPaths> = {
    [Path in keyof RawPaths]: ParsePath<Spec, RawPaths[Path]>
}

/**
 * Parse a path into the `ClientSpec` path shape. `$ref`s are dereferenced to their target path.
 */
type ParsePath<Spec, RawPath> =
    Deref<Spec, RawPath> extends infer Raw
        ? { [Method in keyof Raw as Method extends Methods ? Method : never]: ParseMethod<Spec, Raw, Raw[Method]> }
        : never

/**
 * Parse a method into the `ClientSpec` method shape (parameters, request, responses).
 */
type ParseMethod<Spec, RawPath, RawMethod> = {
    path: ParseParameters<Spec, MergedParameters<RawPath, RawMethod>, 'path'>
    header: ParseParameters<Spec, MergedParameters<RawPath, RawMethod>, 'header'>
    cookie: ParseParameters<Spec, MergedParameters<RawPath, RawMethod>, 'cookie'>
    query: ParseParameters<Spec, MergedParameters<RawPath, RawMethod>, 'query' | 'querystring'>
    request: ParseBody<Spec, Get<RawMethod, 'requestBody'>, 'request'>
    responses: ParseResponses<Spec, Get<RawMethod, 'responses'>>
}

/**
 * Concatenate path-level and operation-level parameters.
 */
type MergedParameters<RawPath, RawMethod> = [
    ...Default<Get<RawPath, 'parameters'>, unknown[], []>,
    ...Default<Get<RawMethod, 'parameters'>, unknown[], []>,
]

/**
 * Parse all parameters of a given type (`path`, `query`, ...) for a given operation into one object.
 *
 * No parameters of `In` type result in `{ [_ in string]: never }` to prevent any parameters from being passed.
 */
type ParseParameters<Spec, RawParams, In> = RawParams extends unknown[]
    ? UnionToIntersection<ParseParameter<Spec, RawParams[number], In>> extends infer R
        ? unknown extends R
            ? { [_ in string]: never }
            : R
        : never
    : never

/**
 * Parse one parameter located in `In`. `$ref`s are dereferenced to their target path.
 *
 * `explode: true` spreads the schema, otherwise the parameter is keyed by name.
 * Non-required, non-path parameters become {@linkcode Partial}.
 */
type ParseParameter<Spec, RawParam, In> =
    Deref<Spec, RawParam> extends infer Raw
        ? Raw extends { name: infer Name extends string; in: In }
            ? (
                  Raw extends { explode: true }
                      ? ParseSchema<Spec, Get<Raw, 'schema'>>
                      : { [K in Name]: ParseSchema<Spec, Get<Raw, 'schema'>> }
              ) extends infer Param
                ? Raw extends { required: true } | { in: 'path' }
                    ? Param
                    : Partial<Param>
                : never
            : never
        : never

/**
 * Parse the responses map, re-keying each entry by its resolved status code (see {@linkcode ResolveStatus}).
 */
type ParseResponses<Spec, RawResp> = {
    [K in keyof RawResp as ResolveStatus<keyof RawResp, K>]: ParseBody<Spec, RawResp[K], 'response'>
}

/**
 * Resolve a response key to a numeric status.
 *
 * - Exact codes (`200`, `404`) stay as-is.
 * - `default` becomes `-1`.
 * - Wildcards (`2XX`) expand to their block's codes excluding any declared exact codes (exact wins on collision).
 */
type ResolveStatus<Statuses, Key> = Key extends `${infer Status extends number}`
    ? Status
    : Key extends 'default'
      ? StatusDefault
      : Key extends `${infer Status extends StatusBlock}XX`
        ? Exclude<`${ExpandBlock<Status>}`, Statuses> extends `${infer Status extends number}`
            ? Status
            : never
        : never

/**
 * Parse the schema from a request or response body's `content`.
 *
 * Request bodies that are not `required` are made optional (`| undefined`); response bodies are always taken as-is.
 */
type ParseBody<Spec, RawBody, In> =
    Deref<Spec, RawBody> extends infer Raw
        ? (
              Raw extends { content: { [_ in string]: { schema: infer Body } } } ? ParseSchema<Spec, Body> : undefined
          ) extends infer Schema
            ? In extends 'response'
                ? Schema
                : Raw extends { required: true }
                  ? Schema
                  : Schema | undefined
            : never
        : never

/**
 * Convert a JSON Schema into its TypeScript type. `$ref`s are dereferenced to their target path.
 *
 * This type handles primitives, objects, arrays, null type, `const`/`enum`, `allOf`/`anyOf`/`oneOf`, and boolean
 * schemas (`true`/`false`). It also handles `nullable` and `type` arrays.
 *
 * It covers a mix of OpenAPI 3.0.x, 3.1.x, and 3.2.x, but does not implement the full JSON Schema specification.
 *
 * It is optimized to handle most common schema types first, such as `string`, `object`, and `array`.
 */
export type ParseSchema<Spec, RawSchema> =
    Deref<Spec, RawSchema> extends infer Raw
        ?
              | (Raw extends {
                    type: infer Type
                    const?: never
                    enum?: never
                    allOf?: never
                    anyOf?: never
                    oneOf?: never
                }
                    ? Type extends 'string'
                        ? string
                        : Type extends 'object'
                          ? StrictParseSchemaObject<Spec, Raw>
                          : Type extends 'array'
                            ? StrictParseSchemaArray<Spec, Raw>
                            : Type extends 'number' | 'integer'
                              ? number
                              : Type extends 'boolean'
                                ? boolean
                                : Type extends 'null'
                                  ? null
                                  : Type extends [infer Head, ...infer Tail]
                                    ? ParseSchema<Spec, { type: Head | Tail } & Omit<Raw, 'type'>>
                                    : never
                    : Raw extends { enum: (infer Item)[] }
                      ? Item
                      : Raw extends { const: infer Const }
                        ? Const
                        : Raw extends true | { allOf: [] } | { anyOf: [] } | { oneOf: [] }
                          ? unknown
                          : Raw extends false
                            ? never
                            : Raw extends { allOf: [infer Head, ...infer Tail] }
                              ? ParseSchema<Spec, Head> & ParseSchema<Spec, { allOf: Tail }>
                              : Raw extends { anyOf: [infer Head, ...infer Tail] }
                                ? Partial<ParseSchema<Spec, Head>> & ParseSchema<Spec, { anyOf: Tail }>
                                : Raw extends { oneOf: [infer Head, ...infer Tail] }
                                  ? Partial<ParseSchema<Spec, Head>> & ParseSchema<Spec, { oneOf: Tail }>
                                  : StrictParseSchemaObject<Spec, Raw>)
              | (Raw extends { nullable: true } ? null : never)
        : never

/**
 * Parse an object schema into a record type: `required` properties stay mandatory, the rest become optional,
 * and `additionalProperties` adds an index signature.
 */
type StrictParseSchemaObject<Spec, Raw> = Raw extends (
    | { type: 'object'; properties?: infer Properties }
    | { type?: never; properties: infer Properties }
    | { type?: never; additionalProperties: infer Additional }
) & { required?: infer Required; additionalProperties?: infer Additional }
    ? {
          [K in keyof Properties as K extends Default<Required, string[], []>[number] ? K : never]: ParseSchema<
              Spec,
              Properties[K]
          >
      } & {
          [K in keyof Properties as K extends Default<Required, string[], []>[number] ? never : K]?: ParseSchema<
              Spec,
              Properties[K]
          >
      } & (unknown extends Additional ? unknown : { [_: string]: ParseSchema<Spec, Additional> })
    : never

/** Parse an array schema into `Item[]` from its `items` schema. */
// TODO: implement prefixItems
type StrictParseSchemaArray<Spec, Raw> = Raw extends { items: infer Item } ? ParseSchema<Spec, Item>[] : never

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

type Methods = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace' | 'query'

type Path = {
    $ref?: string
    parameters?: (Parameter | Reference)[]
    additionalOperations?: { [_ in string]: Operation }
} & {
    [_ in Methods]?: Operation
}

type Operation = {
    parameters?: (Parameter | Reference)[]
    requestBody?: RequestBody | Reference
    responses?: { [_ in string]: ResponseBody | Reference }
}

type Parameter = {
    name: string
    in: 'query' | 'header' | 'path' | 'cookie' | 'querystring'
    required?: boolean
    explode?: boolean
    schema?: Schema | Reference
}

type RequestBody = {
    content: { [_ in string]: MediaType }
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
