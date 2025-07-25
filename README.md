# @_apparatus_/fetch-tools

[![bundle size](https://deno.bundlejs.com/?q=@_apparatus_/fetch-tools&badge=detailed)](https://bundlejs.com/?q=@_apparatus_/fetch-tools)

A thin wrapper for `fetch` with an `axios` inspired API.

## Installation

```sh
npm install @_apparatus_/fetch-tools
```

## Features

-   🔌 **Fetch Clients** - Reusable clients with predefined options like base URL and headers.
-   🔄 **JSON Handling** - Automatically serializes request body and sets `content-type` header.
-   📦 **Response Parsing** - One-step response handling based on content-type.
-   ⚠️ **Error Handling** - Throws for non-2XX status codes by default, customizable through `status` option.
-   ⏱️ **Timeouts** - Request timeout configuration with optional reset on retries.
-   🔁 **Retries** - Configurable retry attempts and delay for specific status codes.
-   🎯 **Interceptors** - Hooks to modify requests and responses.

## Examples

### Basic Usage

```ts
import { client } from '@_apparatus_/fetch-tools'

// create a client instance
const api = client({
    url: 'https://api.example.com',
    headers: { authorization: `Basic ${token}` },
})

type User = { id: string; name: string; email: string }

// make requests
const { request, response, status, body: users } = await api.get<User[]>('/users')
console.log(users[0].name)

// post without stringify
const { body: user } = await api.post<User>('/users', undefined, {
    name: 'John',
    email: 'john@example.com',
})
console.log(user.id)
```

### Search parameters

```ts
const api = client({
    url: 'https://api.example.com',
    search: { version: '1.0', apiKey: 'xyz' },
})

// adds parameters: https://api.example.com/users?version=1.0&apiKey=xyz&orderBy=name
await api.get('/users', { search: { orderBy: 'name' } })
```

### Timeouts

```ts
const api = client({
    url: 'https://api.example.com',
    timeout: 5000, // timeout in milliseconds
    timeoutReset: true, // reset timeout on retry
})

// override client options
await api.get('/users', { timeout: 10000 })
```

### Retries

```ts
// retry options set in the client
const api = client({
    url: 'https://api.example.com',
    retry: 5, // number of retries
    retryDelay: [200, 400, 800], // delay in milliseconds for each retry
    retryStatus: [408, 5], // retry only for 408 and 5XX status
})

// override client options
await api.get('/users', { retry: 2 })
```

### Status codes

```ts
const api = client({ url: 'https://api.example.com' })

const { status, body } = await api.get('/users/123', {
    status: [2, 404], // will not throw for 2XX and 404 as valid codes
})
if (status === 404) console.log('User not found')

await api.get('/users', {
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

### Error Handling

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

## API Reference

### Fetch and call options

The client accepts most standard `fetch` options plus these additional options:

-   `url`: Base URL for all requests
-   `search`: Additional URL search parameters
-   `headers`: Requests headers
-   `parse`: Auto-parse response body (default: true)
-   `timeout`: Request timeout in milliseconds
-   `timeoutReset`: Reset timeout on retries
-   `retry`: Number of retry attempts
-   `retryDelay`: Array of delays between retries
-   `retryStatus`: Status codes that trigger retry
-   `status`: Success status codes (1-digit values represent the entire status block)
-   `interceptRequest`: Request interceptor function
-   `interceptResponse`: Response interceptor function

See FetchOptions documentation in code for additional details and default values.

### Response object

Each request returns a `FetchResponse` object containing:

-   `request`: Original Request object
-   `response`: Raw Response object
-   `status`: Response status code
-   `body`: Parsed response body
