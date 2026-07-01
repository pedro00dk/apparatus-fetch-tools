import { ExpandBlock, Get, OptionalEmpty, OptionalUndefined, StatusBlock, StatusDefault } from './util'

/**
 * Base API specification type used to create typed {@linkcode Client}s.
 */
export type ClientSpec<Methods extends string = string> = {
    [Path in string]: {
        [Method in Methods]?: {
            path: { [_ in string]: unknown }
            query: { [_ in string]: unknown }
            header: { [_ in string]: string }
            cookie: { [_ in string]: string }
            request: BodyInit | object | string | number | bigint | boolean | null | undefined
            responses: { [_ in number]: unknown }
        }
    }
}

/**
 * Default API specification with all paths and methods allowed, used for untyped clients.
 */
export type DefaultSpec<Methods extends string = DefaultMethod> = {
    [Path in string]: {
        [Method in Methods]: {
            path: { [_ in string]: unknown }
            query: { [_ in string]: unknown }
            header: { [_ in string]: string }
            cookie: { [_ in string]: string }
            request: BodyInit | object | string | number | bigint | boolean | null | undefined
            responses: { [_ in number]: unknown }
        }
    }
}

/**
 * HTTP methods for the {@linkcode DefaultSpec}.
 */
export type DefaultMethod =
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'delete'
    | 'head'
    | 'options'
    | 'trace'
    | 'connect'
    | 'query'

/**
 * Create a typed fetch client based on the provided {@linkcode ClientSpec}.
 *
 * An untyped {@linkcode DefaultClient} is available through `$` if `Bypass` is `true`, useful for dynamic requests.
 */
export type Client<Spec, Bypass = true> = {
    $: Bypass extends true ? Client<DefaultSpec, false> : never
} & {
    [Path in keyof Spec]: {
        [Method in keyof Spec[Path]]: (<
            ResponseOverride = unknown,
            RequestOverride = unknown,
            Request extends ClientRequest<Spec[Path][Method], RequestOverride> = ClientRequest<
                Spec[Path][Method],
                RequestOverride
            >,
        >(
            ...request: {} extends ClientRequest<Spec[Path][Method], RequestOverride>
                ? [request?: Request]
                : [request: Request]
        ) => Promise<ClientResponse<Spec[Path][Method], ResponseOverride, Request>>) & {
            error: ClientError_<Spec[Path][Method]>
        }
    }
}

/**
 * ClientRequest extends {@linkcode RequestInit} with additional utilities.
 *
 * This can be used to either construct clients or to perform HTTP calls directly.
 */
export type ClientRequest<
    MethodSpec = DefaultSpec[string][DefaultMethod], //
    BodyOverride = unknown,
> = Omit<RequestInit, 'headers' | 'body'> & {
    /**
     * Base URL used as prefix for HTTP calls.
     *
     * URL resolution uses axios-like algorithm. URL path segments are never stripped.
     */
    url?: URL | string

    /**
     * Parse the response body based on its content-type, might return a string, object, array, or blob.
     * If `false`, the `response.body` reader is returned.
     *
     * Default: `true`
     */
    parse?: boolean

    /**
     * Request timeout in milliseconds.
     *
     * Default: `Infinity`
     */
    timeout?: number

    /**
     * Reset the timeout for request retries.
     *
     * Default: `false`
     */
    timeoutReset?: boolean

    /**
     * Number of retries if status check fails.
     *
     * Default: `0`
     */
    retry?: number

    /**
     * Retry delay in milliseconds. A list of delays may be informed for each retry attempt.
     *
     * Default: `[100, 500, 2500, 10000]`
     */
    retryDelay?: [number, ...number[]]

    /**
     * Which response status codes can trigger a retry.
     * Single digits represent the entire block (`5` -> `5XX`).
     *
     * Default: `[408, 425, 429, 5]`
     */
    retryStatus?: [number, ...number[]]

    /**
     * Which response status codes are considered success.
     * Single digits represent the entire block (`2` -> `2XX`).
     *
     * Default: `[2]`
     */
    status?: (Exclude<keyof Get<MethodSpec, 'responses'>, StatusDefault> | 0 | StatusBlock | (number & {}))[]

    /**
     * Intercept the resolved {@linkcode Request} object before the {@linkcode call} call.
     * The interceptor function may mutate `request` or override it by returning a new {@linkcode Request}.
     *
     * Client and call interceptors are called in order.
     *
     * @param request Request to mutate or override.
     */
    interceptRequest?: (request: Request) => void | Request | Promise<void | Request>

    /**
     * Intercept the received {@linkcode Response} object after successful status check.
     * The interceptor function may mutate `response` or override it by returning a new {@linkcode Response}.
     *
     * Client and call interceptors are called in order.
     *
     * @param response Response to mutate or override.
     */
    interceptResponse?: (response: Response) => void | Response | Promise<void | Response>
} & OptionalEmpty<{
        /**
         * Path template parameters to replace in the `url` field. It uses the `{key}` syntax.
         *
         * Given `url` is set to `/users/{id}` and `path` is `{ id: '123' }`, the resulting URL will be `/users/123`.
         */
        path: Get<MethodSpec, 'path'>

        /**
         * Query parameters appended to any existing parameters specified in `url`.
         */
        query: Get<MethodSpec, 'query'>
    }> & {
        /**
         * Stricter version of {@linkcode RequestInit} `headers` for simpler merging.
         */
        header?: Partial<Get<MethodSpec, 'header'>>

        /**
         * Cookies to be included in the request.
         */
        cookie?: Partial<Get<MethodSpec, 'cookie'>>
    } & OptionalUndefined<{
        /**
         * Request body.
         */
        body: unknown extends BodyOverride ? Get<MethodSpec, 'request'> : BodyOverride
    }>

/**
 * ClientResponse wraps request and response objects and provide a typed `status` and `body`.
 *
 * The `status` field of the request narrows the resulting union. Each requested code is resolved
 * independently (see {@linkcode ResolveStatuses}) and the resolved entries are unioned together.
 */
export type ClientResponse<
    MethodSpec = DefaultSpec[string][DefaultMethod],
    BodyOverride = unknown,
    Request = ClientRequest<MethodSpec, unknown>,
> = unknown extends BodyOverride
    ? ResolveStatuses<Get<MethodSpec, 'responses'>, RequestStatus<Request>[number], Request>
    : ResponseEntry<number, BodyOverride, Request>

/**
 * The requested status codes, defaulting to `[2]` when none were explicitly provided.
 *
 * The check is intentionally non-distributive (`[S] extends [number[]]`): an omitted request argument makes
 * `Request` resolve to the default `ClientRequest`, whose optional `status?` reads back as `(...)[] | undefined`.
 * A distributive check would split that union and keep the `(...)[]` half (the wide status bug); as a whole it
 * is not a clean `number[]`, so it correctly falls back to `[2]`.
 */
type RequestStatus<Request> = [Get<Request, 'status'>] extends [number[]] ? Get<Request, 'status'> : [2]

/**
 * Resolve the requested status codes into a union of {@linkcode ResponseEntry}.
 *
 * Wildcards (single block digits, e.g. `2`) and exact codes (e.g. `200`) are resolved separately
 * since the responses map already has its wildcards expanded into exact codes with collisions handled.
 */
type ResolveStatuses<Responses, Codes extends number, Request> =
    | ResolveExact<Responses, Exclude<Codes, StatusBlock>, Request>
    | ResolveWildcard<Responses, Extract<Codes, StatusBlock>, Request>

/**
 * Resolve an exact code: exact response > fallback (`-1`) > `unknown`.
 * The literal code is always preserved as the entry `status`.
 */
type ResolveExact<Responses, Codes extends number, Request> = Codes extends number
    ? ResponseEntry<Codes, Codes extends keyof Responses ? Responses[Codes] : FallbackBody<Responses>, Request>
    : never

/**
 * Resolve a wildcard block: every exact code of the block present in `Responses` is added with its own
 * literal `status`. If the block matches nothing, it expands to the block's literal codes carrying the
 * fallback (`-1`) body, or `unknown` when no fallback exists.
 *
 * The block is expanded to literal codes (rather than collapsed to `number`) so the fallback body stays
 * confined to its own status codes and does not leak into the narrowing of unrelated codes.
 */
type ResolveWildcard<Responses, Wilds extends StatusBlock, Request> = Wilds extends StatusBlock
    ? Extract<ExpandBlock<Wilds>, keyof Responses> extends infer Matched
        ? [Matched] extends [never]
            ? ExpandBlock<Wilds> extends infer Code
                ? Code extends number
                    ? ResponseEntry<Code, FallbackBody<Responses>, Request>
                    : never
                : never
            : Matched extends number
              ? ResponseEntry<Matched, Get<Responses, Matched>, Request>
              : never
        : never
    : never

/** Body of the fallback (`-1`) response, or `unknown` when the spec declares no fallback. */
type FallbackBody<Responses> = StatusDefault extends keyof Responses ? Responses[StatusDefault] : unknown

/** A single resolved response: typed `status` and `body` alongside the raw request/response objects. */
type ResponseEntry<Status extends number, Body, Request> = {
    status: Status
    body: Body
    request: Request
    response: Response
}

type ClientError_<MethodSpec> =
    PickStatus<Get<MethodSpec, 'responses'>, ExpandBlock<3 | 4 | 5>> extends infer Errors
        ? {
              [Status in keyof Errors]: ClientError<Status extends number ? Status : number, Errors[Status]>
          }[keyof Errors]
        : never

/** Keep only the response entries whose status code matches `Statuses`. */
type PickStatus<Responses, Statuses> = Pick<Responses, Statuses & keyof Responses>

/**
 * ClientError wraps request and response objects and provide a typed `status` and `body`.
 */
export class ClientError<Status = number, Body = unknown> extends Error {
    public readonly request: Request
    public readonly response: Response | undefined
    public readonly error: unknown | undefined
    public readonly status: Status | undefined
    public readonly body: Body | undefined

    constructor(request: Request, response?: Response, error?: unknown, status?: Status, body?: Body) {
        super(response?.statusText ?? String(error))
        this.request = request
        this.response = response
        this.error = error
        this.status = status
        this.body = body
    }
}
