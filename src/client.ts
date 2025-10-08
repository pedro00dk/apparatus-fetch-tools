/**
 * Fetch options extends {@linkcode RequestInit} with additional utilities.
 *
 * Options can be used to either construct a fetch {@linkcode client} or to perform a fetch {@linkcode call}.
 * See fields for merging resolution details. If no details are described, call options override client options.
 *
 * The `body` field is excluded from options, and must be passed to clients or {@linkcode call} directly.
 */
export type FetchOptions = Omit<RequestInit, 'body' | 'headers'> & {
    /**
     * Base URL used as prefix for {@linkcode call}'s `path` parameter.
     *
     * URLs are resolved using `new URL(path, client.url)`.
     *
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URL_API/Resolving_relative_references, Relative URLs}
     */
    url?: URL | string

    /**
     * Additional query parameters appended to any previous parameters specified in `url`.
     *
     * Client and call (with higher priority) options are merged.
     */
    query?: { [_ in string]: unknown }

    /**
     * Stricter version of {@linkcode RequestInit} `headers` for easier merging.
     *
     * Client and call (with higher priority) options are merged.
     */
    headers?: { [_ in string]: string }

    /**
     * Parse the response body based in its content type, might return a string, object, array, or blob.
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
     * Default: `[100, 200, 400, 800, 1600]`
     */
    retryDelay?: [number, ...number[]]

    /**
     * Which response status codes can trigger a retry.
     * Single digits represent the entire block (`2` -> `2XX`).
     *
     * Default: `[408, 425, 429, 5]`
     */
    retryStatus?: [number, ...number[]]

    /**
     * Which response status codes are considered success.
     * Single digits represent the entire block (`2` -> `2XX`).
     * `0` is part of the default in order to support `no-cors` requests.
     *
     * Default: `[0, 2]`
     */
    status?: [number, ...number[]]

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
}

/**
 * The fetch client.
 */
export type FetchClient = ReturnType<typeof client>

/**
 * Response object for the {@linkcode call} call wrapper.
 */
export type FetchResponse<TBody> = {
    request: Request
    response: Response
    status: number
    body: TBody
}

/**
 * Custom class for fetch errors.
 */
export class FetchError<TBody = unknown> extends Error {
    public request: Request
    public response: Response | undefined
    public error: unknown | undefined
    public status: number | undefined
    public body: TBody | undefined

    constructor(request: Request, response?: Response, error?: unknown, status?: number, body?: TBody) {
        super(response?.statusText ?? String(error))
        this.request = request
        this.response = response
        this.error = error
        this.status = status
        this.body = body
    }
}

/**
 * Create a {@linkcode fetch} client. See {@linkcode call} for fetch wrapper details.
 *
 * @param client Fetch client options.
 */
export const client = (client: FetchOptions) => {
    type Method = (typeof methods)[number]
    type Fn = <T>(path: URL | string, opts?: FetchOptions, body?: BodyInit | object) => Promise<FetchResponse<T>>
    const methods = ['get', 'head', 'options', 'trace', 'put', 'delete', 'post', 'patch', 'connect'] as const
    return methods.reduce(
        ($, method) => (($[method] = (path, options, body) => call(method, path, body, client, options)), $),
        {} as { [_ in Method]: Fn },
    )
}

/**
 * {@linkcode fetch} wrapper with support for extended {@linkcode FetchOptions}.
 *
 * If a plain object or array is specified for `body`, it is serialized using `JSON.stringify` and the `content-type`
 * header is set to `application/json`.
 *
 * {@linkcode Request} init errors are thrown as is, network and status errors are wrapped in {@linkcode FetchError}.
 * {@linkcode Response} body is parsed based on `client.parse` and `call.parse`, and response content type.
 *
 * @param method Request method.
 * @param path Request path.
 * @param body Request body.
 * @param client Fetch client options.
 * @param call Fetch call options.
 */
export const call = async <TBody = unknown>(
    method: string,
    path: URL | string,
    body?: BodyInit | object,
    client: FetchOptions = {},
    call: FetchOptions = {},
): Promise<FetchResponse<TBody>> => {
    const url = new URL(path, call.url ?? client?.url)
    const query = { ...client?.query, ...call?.query }
    const headers = { ...client?.headers, ...call?.headers }
    method = method.toUpperCase()
    if (method === 'HEAD' || method === 'GET') body = undefined

    const isJson = !!body && [Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(body))
    if (isJson) headers['content-type'] = 'application/json'
    const requestBody = isJson ? JSON.stringify(body) : (body as BodyInit)
    const abortController = new AbortController()
    const signal = AbortSignal.any([abortController.signal, client.signal!, call.signal!].filter(v => v))

    Object.entries(query)
        .filter(([, value]) => value != undefined)
        .forEach(([key, value]) =>
            url.searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : `${value}`),
        )
    let request = new Request(new Request(url, client), { ...call, method, headers, signal, body: requestBody })
    request = client?.interceptRequest?.(request) ?? request
    request = call?.interceptRequest?.(request) ?? request

    const parse = call.parse ?? client.parse ?? true
    const timeout = Math.min(call?.timeout ?? client?.timeout ?? Infinity, 2 ** 31 - 1)
    const timeoutReset = call?.timeoutReset ?? client?.timeoutReset ?? false
    const retry = call?.retry ?? client?.retry ?? 0
    const retryDelay = call?.retryDelay ?? client?.retryDelay ?? [100, 200, 400, 800, 1600]
    const retryStatus = call?.retryStatus ?? client?.retryStatus ?? [408, 425, 429, 5]
    const matchStatus = call?.status ?? client?.status ?? [0, 2]

    let handle!: number
    let response!: Response
    let requestSuccess = false
    let requestRetry = false

    for (let attempt = 0; attempt <= retry; attempt++) {
        if (timeoutReset) clearTimeout(handle), (handle = 0)
        await new Promise(resolve => {
            setTimeout(resolve, attempt === 0 ? 0 : retryDelay.at(attempt - 1) ?? retryDelay.at(-1))
            signal.addEventListener('abort', resolve)
        })
        handle ||= setTimeout(() => abortController.abort(), timeout) as unknown as number
        try {
            response = await globalThis.fetch(request)
        } catch (error) {
            throw new FetchError(request, response, error, undefined, undefined)
        }
        const status = response.status
        const block = ~~(status / 100)
        requestSuccess = matchStatus.includes(status) || matchStatus.includes(block)
        requestRetry = retryStatus.includes(status) || retryStatus.includes(block)
        if (requestSuccess || !requestRetry) break
    }
    clearTimeout(handle)

    const type = response.headers.get('content-type')
    const format = type?.startsWith('text/plain')
        ? 'text'
        : type?.startsWith('application/json')
        ? 'json'
        : type?.startsWith('multipart/form-data')
        ? 'formData'
        : 'blob'
    const responseBody = (parse ? await response[format]() : response.body) as TBody
    if (!requestSuccess) throw new FetchError(request, response, 'status', response.status, responseBody)
    response = client?.interceptResponse?.(response) ?? response
    response = call?.interceptResponse?.(response) ?? response
    return { request, response, status: response.status, body: responseBody }
}
