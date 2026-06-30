/**
 * Compile-time tests for response status-code resolution.
 *
 * This file is checked by `tsc` (run `bun run build` or `npx tsc --noEmit`). It executes nothing —
 * a wrong type produces a compile error. Each `expect<...>()` line documents one behavior; flip a
 * type to see it fail.
 */
import { client } from './client'
import { ClientResponse } from './types/client'
import { FromOpenApiSpec } from './types/openapi'
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
                    '200': { content: { 'application/json': { schema: { const: 'ok' } } } }
                    '3XX': { content: { 'application/json': { schema: { const: 'other3xx' } } } }
                    '400': { content: { 'application/json': { schema: { const: 'bad' } } } }
                    '404': { content: { 'application/json': { schema: { const: 'notfound' } } } }
                    '4XX': { content: { 'application/json': { schema: { const: 'other4xx' } } } }
                    default: { content: { 'application/json': { schema: { const: 'fallback' } } } }
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
type NoFallback = Omit<Spec['/x']['get'], 'responses'> & { responses: Omit<Responses, -1> }
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

// Reference values so nothing is flagged as unused.
export const _typeTest = { api, narrowing }
