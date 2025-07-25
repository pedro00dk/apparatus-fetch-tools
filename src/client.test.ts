import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import assert from 'node:assert/strict'
import { after, afterEach, before, mock, test } from 'node:test'
import { client } from './client.ts'

const url = 'http://api.example.com'
const msw = setupServer()

before(() => msw.listen())
afterEach(() => msw.resetHandlers())
after(() => msw.close())

test('create client', async () => {
    msw.use(http.get(url, () => HttpResponse.json({ data: 'root' })))
    const api = client({ url })
    assert.deepEqual((await api.get('')).body, { data: 'root' })
})

test('request URL resolution', async () => {
    msw.use(http.get(`${url}`, () => HttpResponse.json({ data: 'root' })))
    msw.use(http.get(`${url}/hello`, () => HttpResponse.json({ data: 'hello' })))
    msw.use(http.get(`${url}/world`, () => HttpResponse.json({ data: 'world' })))
    msw.use(http.get(`${url}/hello/world`, () => HttpResponse.json({ data: 'hello world' })))

    const apiA = client({ url })
    assert.deepEqual((await apiA.get('/')).body, { data: 'root' })
    assert.deepEqual((await apiA.get('/.')).body, { data: 'root' })
    assert.deepEqual((await apiA.get('/./')).body, { data: 'root' })
    assert.deepEqual((await apiA.get('')).body, { data: 'root' })
    assert.deepEqual((await apiA.get('.')).body, { data: 'root' })
    assert.deepEqual((await apiA.get('./')).body, { data: 'root' })
    assert.deepEqual((await apiA.get('/world')).body, { data: 'world' })
    assert.deepEqual((await apiA.get('world')).body, { data: 'world' })
    assert.deepEqual((await apiA.get('./world')).body, { data: 'world' })

    const apiB = client({ url: `${url}/hello` })
    assert.deepEqual((await apiB.get('/')).body, { data: 'root' })
    assert.deepEqual((await apiB.get('/.')).body, { data: 'root' })
    assert.deepEqual((await apiB.get('/./')).body, { data: 'root' })
    assert.deepEqual((await apiB.get('')).body, { data: 'hello' }) //
    assert.deepEqual((await apiB.get('.')).body, { data: 'root' })
    assert.deepEqual((await apiB.get('./')).body, { data: 'root' })
    assert.deepEqual((await apiB.get('/world')).body, { data: 'world' })
    assert.deepEqual((await apiB.get('world')).body, { data: 'world' })
    assert.deepEqual((await apiB.get('./world')).body, { data: 'world' })

    const apiC = client({ url: `${url}/hello/` })
    assert.deepEqual((await apiC.get('/')).body, { data: 'root' })
    assert.deepEqual((await apiC.get('/.')).body, { data: 'root' })
    assert.deepEqual((await apiC.get('/./')).body, { data: 'root' })
    assert.deepEqual((await apiC.get('')).body, { data: 'hello' }) //
    assert.deepEqual((await apiC.get('.')).body, { data: 'hello' }) //
    assert.deepEqual((await apiC.get('./')).body, { data: 'hello' }) //
    assert.deepEqual((await apiC.get('/world')).body, { data: 'world' })
    assert.deepEqual((await apiC.get('world')).body, { data: 'hello world' }) //
    assert.deepEqual((await apiC.get('./world')).body, { data: 'hello world' }) //
})

test('request body serialize', async () => {
    const spy = mock.fn()
    msw.use(
        http.post(url, async ({ request }) => {
            spy(request.headers.get('content-type'), await request.text())
            return new HttpResponse()
        }),
    )
    await client({ url }).post('', {}, {})
    assert.deepEqual(spy.mock.calls[0].arguments, ['application/json', '{}'])
})

test('response body parse', async () => {
    const jpegInit = { headers: { 'content-type': 'image/jpeg' } }
    msw.use(http.get(`${url}/text`, () => HttpResponse.text('text')))
    msw.use(http.get(`${url}/json`, () => HttpResponse.json([])))
    msw.use(http.get(`${url}/form`, () => HttpResponse.formData(new FormData())))
    msw.use(http.get(`${url}/blob`, () => HttpResponse.arrayBuffer(new ArrayBuffer())))
    msw.use(http.get(`${url}/jpeg`, () => HttpResponse.arrayBuffer(new ArrayBuffer(), jpegInit)))

    const api = client({ url: url })
    assert.ok(typeof (await api.get('text')).body === 'string')
    assert.ok((await api.get('json')).body instanceof Array)
    assert.ok((await api.get('form')).body instanceof FormData)
    const blob = await (await api.get('blob')).body
    assert.ok(blob instanceof Blob && blob.type === 'application/octet-stream')
    const jpeg = await (await api.get('jpeg')).body
    assert.ok(jpeg instanceof Blob && jpeg.type === 'image/jpeg')
    const stream = await (await api.get('jpeg', { parse: false })).body
    assert.ok(stream instanceof ReadableStream)
})

test('timeout', async () => {
    msw.use(
        http.get<{ wait: string }>(`${url}/:wait`, async ({ params }) => {
            await new Promise(resolve => setTimeout(resolve, +params.wait))
            return new HttpResponse()
        }),
    )

    const api = client({ url })
    await assert.doesNotReject(api.get('40', { timeout: 50 }))
    await assert.rejects(api.get('60', { timeout: 50 }))
})

test('retry', async () => {
    let run = 0
    msw.use(http.get<{ wait: string }>(url, async () => new HttpResponse('', { status: run++ === 2 ? 200 : 500 })))

    const api = client({ url, retryDelay: [0] })
    run = 0
    await assert.rejects(api.get('', { retry: 0 }))
    run = 0
    await assert.rejects(api.get('', { retry: 1 }))
    run = 0
    await assert.doesNotReject(api.get('', { retry: 2 }))
})
