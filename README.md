# @_apparatus_/fetch-tools

[![bundle size](https://deno.bundlejs.com/?q=@_apparatus_/fetch-tools&badge=detailed)](https://bundlejs.com/?q=@_apparatus_/fetch-tools)

A thin wrapper for `fetch` with an `axios` inspired API.

## Installation

```sh
npm install @_apparatus_/fetch-tools
```

## Features

- 🔌 **Fetch clients** - Reusable clients with predefined options like base URL and headers.
- 🔄 **JSON handling** - Automatically serializes request body and sets `content-type` header.
- 📦 **Response parsing** - One-step response handling based on content-type.
- ⚠️ **Error handling** - Throws for non-2XX status codes by default, customizable through `status` option.
- ⏱️ **Timeouts** - Request timeout configuration with optional reset on retries.
- 🔁 **Retries** - Configurable retry attempts and delay for specific status codes.
- 🎯 **Interceptors** - Hooks to modify requests and responses.
- 📋 **OpenAPI spec support** - Typed clients from OpenAPI specifications, without code generation.

## Examples

### Basic usage

```ts
import { client } from '@_apparatus_/fetch-tools'

// create a client instance
const api = client({
    url: 'https://api.example.com',
    header: { authorization: `Basic ${token}` },
})

type User = { id: string; name: string; email: string }

// make requests
const { request, response, status, body: users } = await api.get['/users']<User[]>({})
console.log(users[0].name)

// post without stringify
const { body: user } = await api['/users'].post<User>({
    body: { name: 'John', email: 'john@example.com' },
})
console.log(user.id)
```

### Request parameters

```ts
const api = client({
    url: 'https://api.example.com',
    query: { version: '1.0', apiKey: 'xyz' },
})

// adds query params: https://api.example.com/users/123?version=1.0&apiKey=xyz&orderBy=name
await api.get('/users/{id}', { path: { id: '123' }, query: { orderBy: 'name' } })
```

### Timeouts and retries

```ts
const api = client({
    url: 'https://api.example.com',
    timeout: 5000, // timeout in milliseconds
    timeoutReset: true, // reset timeout on retry
    retry: 5, // number of retries
    retryDelay: [200, 400, 800], // delay in milliseconds for each retry
    retryStatus: [408, 5], // retry only for 408 and 5XX status
})

// override client options
await api['/users'].get({ timeout: 10000 })
await api['/users'].get({ retry: 2 })
```

### Status codes

```ts
const api = client({ url: 'https://api.example.com' })

const { status, body } = await api['/users/123'].get({
    status: [2, 404], // will not throw for 2XX and 404 as valid codes
})
if (status === 404) console.log('User not found')

await api['/users'].get({
    status: [200], // only accept exact 200 status
})
```

### Interceptors

```ts
const api = client({
    url: 'https://api.example.com',
    interceptRequest: request => request.headers.set('authorization', `Bearer ${getDynamicToken()}`),
})
```

### Error handling

The library throws `FetchError` for network or status code errors:

```ts
try {
    await api.get('/users')
} catch (error) {
    if (error instanceof FetchError) {
        console.log(error.status) // status code
        console.log(error.body) // parsed error response
    }
}
```

### OpenAPI spec support

Transform your OpenApi spec into a typescript file and create a client with it, all available paths, methods, request parameters, request bodies, and response bodies will be typed.

```ts
// my-api.openapi.ts
export type MyApiSpec = {
    // JSON spec here
}
```

```ts
import { client, FromOpenApiSpec } from '@_apparatus_/fetch-tools'
import { MyApiSpec } from './my-api.openapi.ts'

const myApi = client<FromOpenApiSpec<MyApiSpec>>()
```
