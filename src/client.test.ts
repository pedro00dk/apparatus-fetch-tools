import { afterAll, afterEach, beforeAll, expect, mock, test } from 'bun:test'
import { default as FormData } from 'form-data'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { client } from './client.ts'

const url = 'http://api.example.com'
const msw = setupServer()

beforeAll(() => msw.listen())
afterEach(() => msw.resetHandlers())
afterAll(() => msw.close())

test('create client', async () => {
    msw.use(http.get(url, () => HttpResponse.json({ data: 'root' })))
    const api = client({ url })
    expect((await api[''].get({})).body).toEqual({ data: 'root' })
})

test('request URL resolution', async () => {
    msw.use(http.get(`${url}`, () => HttpResponse.json({ data: 'root' })))
    msw.use(http.get(`${url}/hello`, () => HttpResponse.json({ data: 'hello' })))
    msw.use(http.get(`${url}/hello/world`, () => HttpResponse.json({ data: 'hello world' })))

    const apiA = client({ url })
    expect((await apiA[''].get({})).body).toEqual({ data: 'root' })
    expect((await apiA['/'].get({})).body).toEqual({ data: 'root' })
    expect((await apiA['hello'].get({})).body).toEqual({ data: 'hello' })
    expect((await apiA['/hello'].get({})).body).toEqual({ data: 'hello' })

    const apiB = client({ url: `${url}/hello` })
    expect((await apiB[''].get({})).body).toEqual({ data: 'hello' })
    expect((await apiB['/'].get({})).body).toEqual({ data: 'hello' })
    expect((await apiB['world'].get({})).body).toEqual({ data: 'hello world' })
    expect((await apiB['/world'].get({})).body).toEqual({ data: 'hello world' })
})

test('request body serialize', async () => {
    const spy = mock((..._: unknown[]) => {})
    msw.use(
        http.post(url, async ({ request }) => {
            spy(request.headers.get('content-type'), await request.text())
            return new HttpResponse()
        }),
    )
    await client({ url })[''].post({ body: {} })
    expect(spy).toHaveBeenCalledWith('application/json', '{}')
})

test(
    'response body parse',
    async () => {
        const params = new URLSearchParams()
        const paramsInit = { headers: { 'content-type': 'application/x-www-form-urlencoded' } }
        const form = new FormData()
        const formInit = { headers: form.getHeaders() }
        const jpegInit = { headers: { 'content-type': 'image/jpeg' } }
        msw.use(http.get(`${url}/json`, () => HttpResponse.json([])))
        msw.use(http.get(`${url}/text`, () => HttpResponse.text('text')))
        msw.use(http.get(`${url}/form`, () => new HttpResponse(form.getBuffer(), formInit)))
        msw.use(http.get(`${url}/param`, () => new HttpResponse(params, paramsInit)))
        msw.use(http.get(`${url}/blob`, () => HttpResponse.arrayBuffer(new ArrayBuffer())))
        msw.use(http.get(`${url}/jpeg`, () => HttpResponse.arrayBuffer(new ArrayBuffer(), jpegInit)))

        const api = client({ url })
        expect(typeof (await api['text'].get({})).body).toBe('string')
        expect((await api['json'].get<Array<undefined>>({})).body).toBeInstanceOf(Array)
        expect((await api['form'].get<FormData>({})).body).toBeInstanceOf(globalThis.FormData)
        expect((await api['param'].get<URLSearchParams>({})).body).toBeInstanceOf(URLSearchParams)
        const blob = (await api['blob'].get<Blob>({})).body
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('application/octet-stream')
        const jpeg = (await api['jpeg'].get<Blob>({})).body
        expect(jpeg).toBeInstanceOf(Blob)
        expect(jpeg.type).toBe('image/jpeg')
        const stream = (await api['jpeg'].get<ReadableStream>({ parse: false })).body
        expect(stream).toBeInstanceOf(ReadableStream)
    },
    { timeout: Infinity },
)

test('timeout', async () => {
    msw.use(
        http.get<{ wait: string }>(`${url}/:wait`, async ({ params }) => {
            await new Promise(resolve => setTimeout(resolve, +params.wait))
            return new HttpResponse()
        }),
    )
    const api = client({ url })
    await expect(api['40'].get({ timeout: 50 })).resolves.toBeDefined()
    await expect(api['60'].get({ timeout: 50 })).rejects.toThrow()
})

test('retry', async () => {
    let run = 0
    msw.use(http.get<{ wait: string }>(url, async () => new HttpResponse('', { status: run++ === 2 ? 200 : 500 })))
    const api = client({ url, retryDelay: [0] })
    await expect(api[''].get({ retry: 0 })).rejects.toThrow()
    run = 0
    await expect(api[''].get({ retry: 1 })).rejects.toThrow()
    run = 0
    await expect(api[''].get({ retry: 2 })).resolves.toBeDefined()
})
