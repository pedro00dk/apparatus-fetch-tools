/**
 * Compile-time tests for response status-code resolution and schema parsing.
 *
 * This file is checked by `tsc` (run `bun run build` or `npx tsc --noEmit`). It executes nothing —
 * a wrong type produces a compile error. Each `expect<...>()` line documents one behavior; flip a
 * type to see it fail.
 */
import { client } from './client'
import { ClientResponse } from './types/client'
import { FromOpenApiSpec, ParserOptions, ParseSchema } from './types/openapi'
import { ExpandBlock } from './types/util'

/** True only when `A` and `B` are mutually assignable (exact equality). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

/** Compile error unless the argument is exactly `true`. */
const expect = <_ extends true>() => {}

// A spec exercising every case: exact code, wildcard block, a code that collides with a wildcard,
// and a default response.
type Spec = FromOpenApiSpec<{
    openapi: '3.1.0'
    paths: {
        '/x': {
            get: {
                responses: {
                    '200': {
                        content: { 'application/json': { schema: { const: 'ok' } } }
                    }
                    '3XX': {
                        content: { 'application/json': { schema: { const: 'other3xx' } } }
                    }
                    '400': {
                        content: { 'application/json': { schema: { const: 'bad' } } }
                    }
                    '404': {
                        content: { 'application/json': { schema: { const: 'notfound' } } }
                    }
                    '4XX': {
                        content: { 'application/json': { schema: { const: 'other4xx' } } }
                    }
                    default: {
                        content: { 'application/json': { schema: { const: 'fallback' } } }
                    }
                }
            }
        }
    }
}>

const api = client<Spec>()

// ---------------------------------------------------------------------------
// The parsed responses map
// ---------------------------------------------------------------------------

type Responses = Spec['/x']['get']['responses']

// Exact code wins over the wildcard that expands onto the same code.
expect<Equal<Responses[200], 'ok'>>()
expect<Equal<Responses[400], 'bad'>>()
expect<Equal<Responses[404], 'notfound'>>()
// Other codes in the block come from the wildcard.
expect<Equal<Responses[401], 'other4xx'>>()
expect<Equal<Responses[499], 'other4xx'>>()
// No `number` index signature leaks in from the wildcard expansion.
expect<Equal<number extends keyof Responses ? true : false, false>>()

// ---------------------------------------------------------------------------
// Response typing per requested `status`
// ---------------------------------------------------------------------------
type Res<S extends number[]> = ClientResponse<Spec['/x']['get'], unknown, { status: S }>

// Exact codes -> literal status, body resolved as exact response (already includes expanded wildcards).
expect<Equal<Res<[200, 404]>['status'], 200 | 404>>()
expect<Equal<Extract<Res<[200, 404]>, { status: 200 }>['body'], 'ok'>>()
expect<Equal<Extract<Res<[200, 404]>, { status: 404 }>['body'], 'notfound'>>()

// An exact code with no response of its own resolves to the fallback (`default` -> -1), keeping its literal status.
expect<Equal<Res<[503]>['status'], 503>>()
expect<Equal<Res<[503]>['body'], 'fallback'>>()

// An exact code with neither a response nor a fallback resolves to `unknown`.
type NoFallback = Omit<Spec['/x']['get'], 'responses'> & {
    responses: Omit<Responses, -1>
}
expect<Equal<ClientResponse<NoFallback, unknown, { status: [503] }>['body'], unknown>>()

// A block request expands to the literal codes of that block present in the spec (here 400..499),
// each keeping its own body: 400 -> 'bad', 404 -> 'notfound', everything else -> 'other4xx'.
type Block4 = Res<[4]>
expect<Equal<Extract<Block4, { status: 400 }>['body'], 'bad'>>()
expect<Equal<Extract<Block4, { status: 404 }>['body'], 'notfound'>>()
expect<Equal<Extract<Block4, { status: 401 }>['body'], 'other4xx'>>()

// A block with no matching response codes expands to the block's literal codes carrying the fallback body.
expect<Equal<Res<[5]>['status'], ExpandBlock<5>>>()
expect<Equal<Res<[5]>['body'], 'fallback'>>()

// Mixing exact codes and wildcards unions both resolutions.
expect<Equal<Res<[2, 404]>['status'], 200 | 404>>()

// A fallback-only wildcard (`5`) must not leak its body into the narrowing of unrelated codes:
// `200`/`403`/`404` resolve to their own bodies, and only genuine 5XX codes carry the fallback.
type Mixed = Res<[200, 404, 4, 5]>
expect<Equal<Extract<Mixed, { status: 200 }>['body'], 'ok'>>()
expect<Equal<Extract<Mixed, { status: 403 }>['body'], 'other4xx'>>()
expect<Equal<Extract<Mixed, { status: 404 }>['body'], 'notfound'>>()
expect<Equal<Extract<Mixed, { status: 500 }>['body'], 'fallback'>>()

// Narrowing on `status` selects the matching body.
function narrowing(r: Res<[200, 404]>) {
    if (r.status === 404) expect<Equal<typeof r.body, 'notfound'>>()
    if (r.status === 200) expect<Equal<typeof r.body, 'ok'>>()
}

// ---------------------------------------------------------------------------
// Default `status` when the request argument is omitted
// ---------------------------------------------------------------------------

// Omitting the request argument must behave like passing an empty object: `status` defaults to `[2]`,
// NOT the wide declared `status` type. Both resolve to just the 200 response.
async function defaultStatus() {
    const omitted = await api['/x'].get()
    const empty = await api['/x'].get({})
    expect<Equal<typeof omitted.status, 200>>()
    expect<Equal<typeof omitted.body, 'ok'>>()
    expect<Equal<typeof empty.status, 200>>()
    expect<Equal<typeof empty.body, 'ok'>>()

    // An explicit `status` is still honored.
    const explicit = await api['/x'].get({ status: [200, 400] })
    expect<Equal<typeof explicit.status, 200 | 400>>()
}

// ---------------------------------------------------------------------------
// ParseSchema
// ---------------------------------------------------------------------------

/**
 * Recursively collapse intersections of mapped types into plain objects.
 *
 * `ParseSchema` builds object types as intersections (required & optional & additional), which are
 * structurally right but not *identical* to a flat object literal, so `Equal` would reject them.
 */
type Flat<T> = T extends object ? { [K in keyof T]: Flat<T[K]> } : T

/** A spec holding reusable component schemas, to exercise `$ref` resolution. */
type Schemas = {
    components: {
        schemas: {
            Str: { type: 'string' }
            Point: {
                type: 'object'
                properties: { x: { type: 'number' }; y: { type: 'number' } }
                required: ['x', 'y']
            }
            RefToStr: { $ref: '#/components/schemas/Str' }
        }
    }
}

/** Parse a schema against {@linkcode Schemas}, defaulting to no parser options. */
type Parse<RawSchema, Options extends ParserOptions = {}> = Flat<ParseSchema<Schemas, RawSchema, Options>>

// Object schemas reused across the union/intersection cases below.
type ObjA = {
    type: 'object'
    properties: { a: { type: 'string' } }
    required: ['a']
}
type ObjB = {
    type: 'object'
    properties: { b: { type: 'number' } }
    required: ['b']
}

// --- primitives ---
expect<Equal<Parse<{ type: 'string' }>, string>>()
expect<Equal<Parse<{ type: 'number' }>, number>>()
expect<Equal<Parse<{ type: 'integer' }>, number>>()
expect<Equal<Parse<{ type: 'boolean' }>, boolean>>()
expect<Equal<Parse<{ type: 'null' }>, null>>()
// `format` is ignored.
expect<Equal<Parse<{ type: 'string'; format: 'date-time' }>, string>>()

// --- boolean schemas ---
expect<Equal<Parse<true>, unknown>>()
expect<Equal<Parse<false>, never>>()

// --- `type` arrays (3.1) and `nullable` (3.0) ---
expect<Equal<Parse<{ type: ['string', 'number'] }>, string | number>>()
expect<Equal<Parse<{ type: ['string', 'null'] }>, string | null>>()
expect<Equal<Parse<{ type: ['string', 'number', 'boolean'] }>, string | number | boolean>>()
expect<Equal<Parse<{ type: 'string'; nullable: true }>, string | null>>()
expect<Equal<Parse<ObjA & { nullable: true }>, { a: string } | null>>()
// `nullable: false` adds nothing.
expect<Equal<Parse<{ type: 'string'; nullable: false }>, string>>()

// --- `enum` / `const`, which win over a declared `type` ---
expect<Equal<Parse<{ enum: ['a', 'b'] }>, 'a' | 'b'>>()
expect<Equal<Parse<{ enum: ['a', 1, null] }>, 'a' | 1 | null>>()
expect<Equal<Parse<{ const: 'ok' }>, 'ok'>>()
expect<Equal<Parse<{ type: 'string'; enum: ['a', 'b'] }>, 'a' | 'b'>>()
expect<Equal<Parse<{ type: 'string'; const: 'a' }>, 'a'>>()

// --- objects ---
expect<Equal<Parse<ObjA>, { a: string }>>()
// Only names listed in `required` stay mandatory.
expect<
    Equal<
        Parse<{
            type: 'object'
            properties: { a: { type: 'string' }; b: { type: 'number' } }
            required: ['a']
        }>,
        { a: string; b?: number }
    >
>()
// No `required` at all makes every property optional.
expect<Equal<Parse<{ type: 'object'; properties: { a: { type: 'string' } } }>, { a?: string }>>()
// An object with no `properties` is an empty object.
expect<Equal<Parse<{ type: 'object' }>, {}>>()
// `additionalProperties` adds an index signature; `true` widens it to `unknown`.
expect<
    Equal<
        Parse<{
            type: 'object'
            properties: { a: { type: 'string' } }
            required: ['a']
            additionalProperties: { type: 'string' }
        }>,
        { [_: string]: string; a: string }
    >
>()
expect<Equal<Parse<{ type: 'object'; additionalProperties: true }>, { [_: string]: unknown }>>()
// A schema with `properties` but no `type` is still parsed as an object.
expect<Equal<Parse<{ properties: { a: { type: 'string' } }; required: ['a'] }>, { a: string }>>()

// --- arrays ---
expect<Equal<Parse<{ type: 'array'; items: { type: 'string' } }>, string[]>>()
expect<Equal<Parse<{ type: 'array'; items: ObjA }>, { a: string }[]>>()
expect<
    Equal<
        Parse<{
            type: 'array'
            items: { type: 'array'; items: { type: 'number' } }
        }>,
        number[][]
    >
>()
// An array schema with neither `items` nor `prefixItems` has no item type to build from.
expect<Equal<Parse<{ type: 'array' }>, never>>()

// --- `prefixItems` tuples ---
// `items: false` closes the tuple.
expect<
    Equal<
        Parse<{
            type: 'array'
            prefixItems: [{ type: 'string' }, { type: 'number' }]
            items: false
        }>,
        [string, number]
    >
>()
// An absent `items` leaves it open, since extra items are unconstrained.
expect<Equal<Parse<{ type: 'array'; prefixItems: [{ type: 'string' }] }>, [string, ...unknown[]]>>()
// `items: true` is the same as absent.
expect<Equal<Parse<{ type: 'array'; prefixItems: [{ type: 'string' }]; items: true }>, [string, ...unknown[]]>>()
// A schema for `items` types everything past the prefix.
expect<
    Equal<
        Parse<{
            type: 'array'
            prefixItems: [{ type: 'string' }]
            items: { type: 'boolean' }
        }>,
        [string, ...boolean[]]
    >
>()
expect<Equal<Parse<{ type: 'array'; prefixItems: []; items: false }>, []>>()
// Tuples nest, and compose with plain arrays.
expect<
    Equal<
        Parse<{
            type: 'array'
            items: {
                type: 'array'
                prefixItems: [{ type: 'string' }, ObjA]
                items: false
            }
        }>,
        [string, { a: string }][]
    >
>()

// --- `allOf` intersects ---
expect<Equal<Parse<{ allOf: [ObjA, ObjB] }>, { a: string; b: number }>>()
expect<Equal<Parse<{ allOf: [ObjA] }>, { a: string }>>()

// --- `anyOf` / `oneOf` default to unions ---
expect<Equal<Parse<{ anyOf: [{ type: 'string' }, { type: 'number' }] }>, string | number>>()
expect<
    Equal<
        Parse<{
            oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }]
        }>,
        string | number | boolean
    >
>()
expect<Equal<Parse<{ oneOf: [{ type: 'string' }] }>, string>>()
expect<Equal<Parse<{ anyOf: [ObjA, ObjB] }>, { a: string } | { b: number }>>()
// A single member must not collapse to `unknown` — the recursion's empty-tail base case would
// otherwise absorb the whole union.
expect<Equal<Parse<{ anyOf: [ObjA] }>, { a: string }>>()

// --- vacuous compositions accept anything, under either mode ---
expect<Equal<Parse<{ allOf: [] }>, unknown>>()
expect<Equal<Parse<{ anyOf: [] }>, unknown>>()
expect<Equal<Parse<{ oneOf: [] }>, unknown>>()
expect<Equal<Parse<{ anyOf: [] }, { anyOfIntersection: true }>, unknown>>()
expect<Equal<Parse<{ oneOf: [] }, { oneOfIntersection: true }>, unknown>>()

// --- the intersection options make every member `Partial` instead ---
expect<Equal<Parse<{ anyOf: [ObjA, ObjB] }, { anyOfIntersection: true }>, { a?: string; b?: number }>>()
expect<Equal<Parse<{ oneOf: [ObjA, ObjB] }, { oneOfIntersection: true }>, { a?: string; b?: number }>>()
// Each option only affects its own keyword.
expect<Equal<Parse<{ oneOf: [ObjA, ObjB] }, { anyOfIntersection: true }>, { a: string } | { b: number }>>()
expect<Equal<Parse<{ anyOf: [ObjA, ObjB] }, { oneOfIntersection: true }>, { a: string } | { b: number }>>()

// --- composition precedence ---
// `anyOf`/`oneOf`/`allOf` win over a sibling `type`, which is dropped.
expect<Equal<Parse<{ type: 'string'; anyOf: [{ type: 'number' }, { type: 'boolean' }] }>, number | boolean>>()
// `allOf` is checked before `anyOf`, so only `allOf` applies when both are present.
expect<Equal<Parse<{ allOf: [ObjA]; anyOf: [ObjB] }>, { a: string }>>()

// --- `$ref` resolution ---
expect<Equal<Parse<{ $ref: '#/components/schemas/Str' }>, string>>()
expect<Equal<Parse<{ $ref: '#/components/schemas/Point' }>, { x: number; y: number }>>()
// A `$ref` resolves wherever a schema is accepted.
expect<Equal<Parse<{ type: 'array'; items: { $ref: '#/components/schemas/Point' } }>, { x: number; y: number }[]>>()
expect<
    Equal<
        Parse<{
            type: 'object'
            properties: { p: { $ref: '#/components/schemas/Point' } }
            required: ['p']
        }>,
        { p: { x: number; y: number } }
    >
>()
expect<
    Equal<
        Parse<{
            oneOf: [{ $ref: '#/components/schemas/Str' }, { type: 'number' }]
        }>,
        string | number
    >
>()
expect<
    Equal<
        Parse<{
            type: 'array'
            prefixItems: [{ $ref: '#/components/schemas/Str' }]
            items: false
        }>,
        [string]
    >
>()
// A pointer at nothing resolves to `undefined`, which no schema branch matches, so it lands on `never`
// rather than failing to compile.
expect<Equal<Parse<{ $ref: '#/components/schemas/Missing' }>, never>>()

// --- options thread all the way down a nested schema ---
type Nested = {
    type: 'object'
    properties: { list: { type: 'array'; items: { oneOf: [ObjA, ObjB] } } }
    required: ['list']
}
expect<Equal<Parse<Nested>, { list: ({ a: string } | { b: number })[] }>>()
expect<Equal<Parse<Nested, { oneOfIntersection: true }>, { list: { a?: string; b?: number }[] }>>()

// --- and options reach schemas through `FromOpenApiSpec` ---
type OneOfSpec<Options extends ParserOptions> = FromOpenApiSpec<
    {
        openapi: '3.1.0'
        paths: {
            '/y': {
                post: {
                    requestBody: {
                        required: true
                        content: {
                            'application/json': { schema: { oneOf: [ObjA, ObjB] } }
                        }
                    }
                    responses: {
                        '200': {
                            content: {
                                'application/json': { schema: { oneOf: [ObjA, ObjB] } }
                            }
                        }
                    }
                }
            }
        }
    },
    Options
>

expect<Equal<Flat<OneOfSpec<{}>['/y']['post']['responses'][200]>, { a: string } | { b: number }>>()
expect<Equal<Flat<OneOfSpec<{}>['/y']['post']['request']>, { a: string } | { b: number }>>()
expect<
    Equal<Flat<OneOfSpec<{ oneOfIntersection: true }>['/y']['post']['responses'][200]>, { a?: string; b?: number }>
>()
expect<Equal<Flat<OneOfSpec<{ oneOfIntersection: true }>['/y']['post']['request']>, { a?: string; b?: number }>>()

// --- array query params accept array or single item ---
type QueryArraySpec = FromOpenApiSpec<{
    openapi: '3.1.0'
    paths: {
        '/q': {
            get: {
                parameters: [
                    {
                        name: 'tags'
                        in: 'query'
                        required: true
                        schema: {
                            type: 'array'
                            items: { type: 'string' }
                        }
                    },
                ]
                responses: {
                    '200': {
                        content: {
                            'application/json': { schema: { const: 'ok' } }
                        }
                    }
                }
            }
        }
    }
}>

expect<Equal<QueryArraySpec['/q']['get']['query'], { tags: string[] | string }>>()

const queryArrayApi = client<QueryArraySpec>()
queryArrayApi['/q'].get({ query: { tags: ['a', 'b'] } })
queryArrayApi['/q'].get({ query: { tags: 'a' } })

// Reference values so nothing is flagged as unused.
export const _typeTest = { api, narrowing, defaultStatus, queryArrayApi }
