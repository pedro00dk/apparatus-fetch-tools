import { Client, ClientError, ClientRequest, ClientResponse, DefaultSpec } from './types/client'

/**
 * Create a typed fetch client based on the provided {@linkcode ClientSpec}.
 *
 * @param clientOptions Default options for the client.
 */
export const client = <Spec = DefaultSpec, Bypass = true>(defaults: ClientRequest = {}): Client<Spec, Bypass> => {
    type ProxyObject = { path?: string; method?: string; children: { [_ in string]: ProxyObject } }
    const proxyObject = (path?: string, method?: string) => Object.assign(() => {}, { path, method, children: {} })

    const proxyHandler: ProxyHandler<ProxyObject> = {
        apply: (target, _, [request]: [ClientRequest]) => call(target.path!, target.method!, defaults, request),
        get: (target, pathOrMethod, receiver) => {
            if (typeof pathOrMethod !== 'string' || pathOrMethod === '$') return receiver
            const path = target.path ?? pathOrMethod
            const method = target.path !== undefined ? pathOrMethod.toLowerCase() : undefined
            const key = method ?? path
            return (target.children[key] ??= new Proxy(proxyObject(path, method), proxyHandler))
        },
    }

    return new Proxy(proxyObject(), proxyHandler) as unknown as Client<Spec, Bypass>
}

/**
 * {@linkcode fetch} wrapper with support for extended {@linkcode ClientRequest}.
 *
 * @param path Request path.
 * @param method Request method.
 * @param options Request options.
 */
export const call = async (
    path: URL | string,
    method: string,
    ...options: ClientRequest[]
): Promise<ClientResponse> => {
    const merged = options.reduce(($, opts) => Object.assign($, opts), {})
    const {
        url: baseUrl,
        body: rawBody,
        parse = true,
        timeout = Infinity,
        timeoutReset = false,
        retry = 0,
        retryDelay = [100, 500, 2500, 10000],
        retryStatus = [408, 425, 429, 5],
        status: matchStatus = [2],
    } = merged
    const paths = options.reduce<{ [_ in string]: unknown }>(($, { path }) => Object.assign($, path), {})
    const queries = options.reduce<{ [_ in string]: unknown }>(($, { query }) => Object.assign($, query), {})
    const headers = options
        .flatMap(({ header }) => Object.entries(header ?? {}))
        .filter(([, value]) => value != undefined)
        .reduce<{ [_ in string]: string }>(($, [key, value]) => (($[key.toLowerCase()] = value!), $), {})
    const cookies = Object.entries({
        ...Object.fromEntries(headers['cookie']?.split(';').map(c => c.trim().split('=')) ?? []),
        ...options.reduce<{ [_ in string]?: string }>(($, { cookie }) => Object.assign($, cookie), {}),
    })
    if (cookies.length) headers['cookie'] = cookies.map(([key, value]) => `${key}=${value}`).join('; ')

    method = method.toUpperCase()
    path = `${path}`.replace(/{([^.]+?)}/g, (_, k) => encodeURI(`${paths[k] ?? ''}`) || `{${k}}`)
    const url = new URL(resolveUrl(`${baseUrl}`, path))
    Object.entries(queries)
        .filter(([, value]) => value != undefined)
        .forEach(([key, value]) =>
            url.searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : `${value}`),
        )

    const isJson = !!rawBody && jsonPrototypes.includes(Object.getPrototypeOf(rawBody))
    if (isJson && !headers['content-type']) headers['content-type'] = 'application/json'
    const body = isJson ? JSON.stringify(rawBody) : (rawBody as BodyInit)

    const abortController = new AbortController()
    const signals = [abortController.signal, ...options.map(({ signal }) => signal!).filter(v => v)]
    const signal = AbortSignal.any(signals)

    const request = options.reduce(
        ($, { interceptRequest }) => interceptRequest?.($) ?? $,
        new Request(url, { ...(merged as RequestInit), method, headers, signal, body }),
    )

    let handle!: number
    let response!: Response
    let requestSuccess = false
    let requestRetry = false
    for (let attempt = 0; attempt <= retry; attempt++) {
        if (timeoutReset) (clearTimeout(handle), (handle = 0))
        await new Promise(resolve => {
            setTimeout(resolve, attempt === 0 ? 0 : (retryDelay.at(attempt - 1) ?? retryDelay.at(-1)))
            signal.addEventListener('abort', resolve)
        })
        handle ||= setTimeout(() => abortController.abort(), Math.min(timeout, 2 ** 31 - 1)) as unknown as number
        try {
            response = await globalThis.fetch(request)
        } catch (error) {
            throw new ClientError(request, response, error, undefined, undefined)
        }
        const status = response.status
        const block = ~~(status / 100)
        requestSuccess = matchStatus.includes(status) || matchStatus.includes(block)
        requestRetry = retryStatus.includes(status) || retryStatus.includes(block)
        if (requestSuccess || !requestRetry) break
    }
    clearTimeout(handle)

    const type = response.headers.get('content-type')
    const responseBody = !parse
        ? response.body
        : type?.startsWith('application/json')
          ? await response.json()
          : type?.startsWith('text/plain')
            ? await response.text()
            : type?.startsWith('multipart/form-data')
              ? await response.formData()
              : type?.startsWith('application/x-www-form-urlencoded')
                ? new URLSearchParams(await response.text())
                : await response.blob()

    if (!requestSuccess) throw new ClientError(request, response, 'status', response.status, responseBody)
    response = options.reduce(($, { interceptResponse }) => interceptResponse?.($) ?? $, response)
    return { request, response, status: response.status, body: responseBody }
}

/**
 * List of prototypes whose instances are serialized as JSON by default.
 */
const jsonPrototypes = [Object.prototype, Array.prototype, String.prototype, Number.prototype, Boolean.prototype, null]

/**
 * Axios-like URL resolver for the client's `url` option.
 *
 * @param base Base URL.
 * @param path Request path, or absolute URL.
 */
const resolveUrl = (base = '', path = '') =>
    !base || /^(?:[0-9A-Za-z]+:)?\/\//i.test(path) ? path : `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
