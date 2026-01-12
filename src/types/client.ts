import * as H from 'hotscript'
import { Default, Get, H_If, H_IsSubType, OptionalUndefined, ShortStatus } from './util'

/**
 * Base API specification type used to create typed {@linkcode Client}s.
 */
export type ClientSpec<Methods extends string = string> = {
    [Path in string]: {
        [Method in Methods]?: {
            path?: { [_ in string]: unknown }
            query?: { [_ in string]: unknown }
            header?: { [_ in string]: string }
            cookie?: { [_ in string]: string }
            request?: BodyInit | object | string | number | bigint | boolean | null
            responses: { [_ in number]: unknown }
            fallback: unknown
        }
    }
}

/**
 * Default API specification with all paths and methods allowed, used for untyped clients.
 */
export type DefaultSpec<Methods extends string = DefaultMethod> = {
    [Path in string]: {
        [Method in Methods]: {
            path?: { [_ in string]: unknown }
            query?: { [_ in string]: unknown }
            header?: { [_ in string]: string }
            cookie?: { [_ in string]: string }
            request?: BodyInit | object | string | number | bigint | boolean | null
            responses: { [_ in number]: unknown }
            fallback: unknown
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
        [Method in keyof Spec[Path]]: <
            ResponseOverride = unknown,
            RequestOverride = unknown,
            ErrorOverride = unknown,
            Options extends ClientRequest<Spec[Path][Method], RequestOverride> = ClientRequest<
                Spec[Path][Method],
                RequestOverride
            >,
        >(
            options: Options,
        ) => Promise<ClientResponse<Spec[Path][Method], ResponseOverride, Options>> & {
            $: ClientError_<Spec[Path][Method], ErrorOverride, Options>
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
    status?: (keyof Get<MethodSpec, 'responses'> | 0 | 1 | 2 | 3 | 4 | 5 | (number & {}))[]

    /**
     * Intercept the resolved {@linkcode Request} object before the {@linkcode call} call.
     * The interceptor function may mutate `request` or override it by returning a new {@linkcode Request}.
     *
     * Client and call interceptors are called in order.
     *
     * @param request Request to mutate or override.
     */
    interceptRequest?: (request: Request) => Request | void

    /**
     * Intercept the received {@linkcode Response} object after successful status check.
     * The interceptor function may mutate `response` or override it by returning a new {@linkcode Response}.
     *
     * Client and call interceptors are called in order.
     *
     * @param response Response to mutate or override.
     */
    interceptResponse?: (response: Response) => Response | void
} & OptionalUndefined<{
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

        /**
         * Stricter version of {@linkcode RequestInit} `headers` for simpler merging.
         */
        header?: Partial<Get<MethodSpec, 'header'>>

        /**
         * Cookies to be included in the request.
         */
        cookie?: Partial<Get<MethodSpec, 'cookie'>>

        /**
         * Request body.
         */
        body: unknown extends BodyOverride ? Get<MethodSpec, 'request'> : BodyOverride
    }>

/**
 * ClientResponse wraps request and response objects and provide a typed `status` and `body`.
 */
export type ClientResponse<
    MethodSpec = DefaultSpec[string][DefaultMethod],
    BodyOverride = unknown,
    ClientRequest_ = ClientRequest<MethodSpec, unknown>,
> = H.Pipe<
    Get<MethodSpec, 'responses'>,
    [
        H.Objects.Pick<ShortStatus<Default<Get<ClientRequest_, 'status'>, number[], [2]>[number]>>,
        H_If<
            H_IsSubType<{ [_ in any]: never }>,
            H.Constant<{ [_ in number]: Get<MethodSpec, 'fallback'> | undefined }>,
            H.Identity
        >,
        unknown extends BodyOverride ? H.Identity : H.Constant<{ [_: number]: BodyOverride }>,
        H.Objects.Entries,
        H.Unions.Map<ResponseReshape>,
        H.Unions.Map<H.Objects.Assign<{ request: Request; response: Response }>>,
    ]
>

interface ResponseReshape extends H.Fn {
    return: this['arg0'] extends [infer Status extends number, infer Body] ? { status: Status; body: Body } : never
}

type ClientError_<MethodSpec, BodyOverride, ClientRequest> = H.Pipe<
    Get<MethodSpec, 'responses'>,
    [
        number extends keyof Get<MethodSpec, 'responses'>
            ? H.Identity
            : H.Objects.Pick<ShortStatus<Default<Get<ClientRequest, 'status'>, number[], [2]>[number]>>,
        unknown extends BodyOverride ? H.Identity : H.Constant<{ [_: number]: BodyOverride }>,
        H.Objects.Entries,
        H.Unions.Map<ErrorReshape>,
    ]
>

interface ErrorReshape extends H.Fn {
    return: this['arg0'] extends [infer Status extends number, infer Body]
        ? ClientError<Status, Body>
        : ClientError<number, unknown>
}
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
