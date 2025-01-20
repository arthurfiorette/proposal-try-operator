<br />

<h1>ECMAScript Try Expressions</h1>

> [!WARNING]  
> After a log of discussion and feedback, the proposal was renamed from `Safe Assignment Operator` to `Try Expressions`.

<br />

<div align="center">
  <img src="./assets/banner.png" alt="ECMAScript Try Expressions Proposal" />
</div>

<br />

This proposal intends to address a surging issue regarding the uncommon ergonomics of maintaining subsequent _(and possible nested)_ `try/catch` blocks required to correctly execute operations that might fail at any point.

Only the `catch (error) {}` part is the actual control flow and no program state requires to be within a `try {}` block. Forcing the successful flow to be inside a nested block is not ideal.

<hr />
<br />

- [Why Not `data` First?](#why-not-data-first)
- [Polyfilling](#polyfilling)
- [Using `?=` with Functions and Objects Without `Symbol.result`](#using--with-functions-and-objects-without-symbolresult)
- [Comparison](#comparison)
- [Similar Prior Art](#similar-prior-art)
- [What This Proposal Does Not Aim to Solve](#what-this-proposal-does-not-aim-to-solve)
- [Current Limitations](#current-limitations)
- [Help Us Improve This Proposal](#help-us-improve-this-proposal)
- [Authors](#authors)
- [Inspiration](#inspiration)
- [License](#license)

<br />

<!-- ## Motivation

- **Simplified Error Handling**: Streamline error management by eliminating the need for try-catch blocks.
- **Enhanced Readability**: Improve code clarity by reducing nesting and making the flow of error handling more intuitive.
- **Consistency Across APIs**: Establish a uniform approach to error handling across various APIs, ensuring predictable behavior.
- **Improved Security**: Reduce the risk of overlooking error handling, thereby enhancing the overall security of the code.

<br />

<!-- credits to https://www.youtube.com/watch?v=SloZE4i4Zfk --/>

How often have you seen code like this?

```ts
async function getData() {
  const response = await fetch("https://api.example.com/data")
  const json = await response.json()
  return validationSchema.parse(json)
}
```

The issue with the above function is that it can fail silently, potentially crashing your program without any explicit warning.

1. `fetch` can reject.
2. `json` can reject.
3. `parse` can throw.
4. Each of these can produce multiple types of errors.

To address this, we propose the adoption of a new operator, `?=`, which facilitates more concise and readable error handling.

```ts
async function getData() {
  const [requestError, response] ?= await fetch(
    "https://api.example.com/data"
  )

  if (requestError) {
    handleRequestError(requestError)
    return
  }

  const [parseError, json] ?= await response.json()

  if (parseError) {
    handleParseError(parseError)
    return
  }

  const [validationError, data] ?= validationSchema.parse(json)

  if (validationError) {
    handleValidationError(validationError)
    return
  }

  return data
}
```

<br />

Please refer to the [What This Proposal Does Not Aim to Solve](#what-this-proposal-does-not-aim-to-solve) section to understand the limitations of this proposal.

<br />

## Proposed Features

This proposal aims to introduce the following features:

<br />

### `Symbol.result`

Any object that implements the `Symbol.result` method can be used with the `?=` operator.

```ts
function example() {
  return {
    [Symbol.result]() {
      return [new Error("123"), null]
    },
  }
}

const [error, result] ?= example() // Function.prototype also implements Symbol.result
// const [error, result] = example[Symbol.result]()

// error is Error('123')
```

The `Symbol.result` method must return a tuple, where the first element represents the error and the second element represents the result.

[Why Not `data` First?](#why-not-data-first)

<br />

### The Safe Assignment Operator (`?=`)

The `?=` operator invokes the `Symbol.result` method on the object or function on the right side of the operator, ensuring that errors and results are consistently handled in a structured manner.

```ts
const obj = {
  [Symbol.result]() {
    return [new Error("Error"), null]
  },
}

const [error, data] ?= obj
// const [error, data] = obj[Symbol.result]()
```

```ts
function action() {
  return 'data'
}

const [error, data] ?= action(argument)
// const [error, data] = action[Symbol.result](argument)
```

The result should conform to the format `[error, null | undefined]` or `[null, data]`.

#### Usage in Functions

When the `?=` operator is used within a function, all parameters passed to that function are forwarded to the `Symbol.result` method.

```ts
declare function action(argument: string): string

const [error, data] ?= action(argument1, argument2, ...)
// const [error, data] = action[Symbol.result](argument, argument2, ...)
```

#### Usage with Objects

When the `?=` operator is used with an object, no parameters are passed to the `Symbol.result` method.

```ts
declare const obj: { [Symbol.result]: () => any }

const [error, data] ?= obj
// const [error, data] = obj[Symbol.result]()
```

<br />

### Recursive Handling

The `[error, null]` tuple is generated upon the first error encountered. However, if the `data` in a `[null, data]` tuple also implements a `Symbol.result` method, it will be invoked recursively.

```ts
const obj = {
  [Symbol.result]() {
    return [
      null,
      {
        [Symbol.result]() {
          return [new Error("Error"), null]
        },
      },
    ]
  },
}

const [error, data] ?= obj
// const [error, data] = obj[Symbol.result]()

// error is  Error('string')
```

These behaviors facilitate handling various situations involving promises or objects with `Symbol.result` methods:

- `async function(): Promise<T>`
- `function(): T`
- `function(): T | Promise<T>`

These cases may involve 0 to 2 levels of nested objects with `Symbol.result` methods, and the operator is designed to handle all of them correctly.

<br />

### Promises

A `Promise` is the only other implementation, besides `Function`, that can be used with the `?=` operator.

```ts
const promise = getPromise()
const [error, data] ?= await promise
// const [error, data] = await promise[Symbol.result]()
```

You may have noticed that `await` and `?=` can be used together, and that's perfectly fine. Due to the [Recursive Handling](#recursive-handling) feature, there are no issues with combining them in this way.

```ts
const [error, data] ?= await getPromise()
// const [error, data] = await getPromise[Symbol.result]()
```

The execution will follow this order:

1. `getPromise[Symbol.result]()` might throw an error when called (if it's a synchronous function returning a promise).
2. If **an** error is thrown, it will be assigned to `error`, and execution will halt.
3. If **no** error is thrown, the result will be assigned to `data`. Since `data` is a promise and promises have a `Symbol.result` method, it will be handled recursively.
4. If the promise **rejects**, the error will be assigned to `error`, and execution will stop.
5. If the promise **resolves**, the result will be assigned to `data`.

<br />

### `using` Statement

The `using` or `await using` statement should also work with the `?=` operator. It will perform similarly to a standard `using x = y` statement.

Note that errors thrown when disposing of a resource are not caught by the `?=` operator, just as they are not handled by other current features.

```ts
try {
  using a = b
} catch(error) {
  // handle
}

// now becomes
using [error, a] ?= b

// or with async

try {
  await using a = b
} catch(error) {
  // handle
}

// now becomes
await using [error, a] ?= b
```

The `using` management flow is applied only when `error` is `null` or `undefined`, and `a` is truthy and has a `Symbol.dispose` method.

<br />

## Try/Catch Is Not Enough

<!-- credits to https://x.com/LeaVerou/status/1819381809773216099 --/>

The `try {}` block is rarely useful, as its scoping lacks conceptual significance. It often functions more as a code annotation rather than a control flow construct. Unlike control flow blocks, there is no program state that is meaningful only within a `try {}` block.

In contrast, the `catch {}` block **is** actual control flow, and its scoping is meaningful and relevant.

Using `try/catch` blocks has **two main syntax problems**:

```js
// Nests 1 level for each error handling block
async function readData(filename) {
  try {
    const fileContent = await fs.readFile(filename, "utf8")

    try {
      const json = JSON.parse(fileContent)

      return json.data
    } catch (error) {
      handleJsonError(error)
      return
    }
  } catch (error) {
    handleFileError(error)
    return
  }
}

// Declares reassignable variables outside the block, which is undesirable
async function readData(filename) {
  let fileContent
  let json

  try {
    fileContent = await fs.readFile(filename, "utf8")
  } catch (error) {
    handleFileError(error)
    return
  }

  try {
    json = JSON.parse(fileContent)
  } catch (error) {
    handleJsonError(error)
    return
  }

  return json.data
}
```

<br />

## Why Not `data` First?

In Go, the convention is to place the data variable first, and you might wonder why we don't follow the same approach in JavaScript. In Go, this is the standard way to call a function. However, in JavaScript, we already have the option to use `const data = fn()` and choose to ignore the error, which is precisely the issue we are trying to address.

If someone is using `?=` as their assignment operator, it is because they want to ensure that they handle errors and avoid forgetting them. Placing the data first would contradict this principle, as it prioritizes the result over error handling.

```ts
// ignores errors!
const data = fn()

// Look how simple it is to forget to handle the error
const [data] ?= fn()

// This is the way to go
const [error, data] ?= fn()
```

If you want to suppress the error (which is **different** from ignoring the possibility of a function throwing an error), you can simply do the following:

```ts
// This suppresses the error (ignores it and doesn't re-throw it)
const [, data] ?= fn()
```

This approach is much more explicit and readable because it acknowledges that there might be an error, but indicates that you do not care about it.

The above method is also known as "try-catch calaboca" (a Brazilian term) and can be rewritten as:

```ts
let data
try {
  data = fn()
} catch {}
```

Complete discussion about this topic at https://github.com/arthurfiorette/try-expressions/issues/13 if the reader is interested.

<br />

## Polyfilling

This proposal can be polyfilled using the code provided at [`polyfill.js`](./polyfill.js).

However, the `?=` operator itself cannot be polyfilled directly. When targeting older JavaScript environments, a post-processor should be used to transform the `?=` operator into the corresponding `[Symbol.result]` calls.

```ts
const [error, data] ?= await asyncAction(arg1, arg2)
// should become
const [error, data] = await asyncAction[Symbol.result](arg1, arg2)
```

```ts
const [error, data] ?= action()
// should become
const [error, data] = action[Symbol.result]()
```

```ts
const [error, data] ?= obj
// should become
const [error, data] = obj[Symbol.result]()
```

<br />

## Using `?=` with Functions and Objects Without `Symbol.result`

If the function or object does not implement a `Symbol.result` method, the `?=` operator should throw a `TypeError`.

<br />

## Comparison

The `?=` operator and the `Symbol.result` proposal do not introduce new logic to the language. In fact, everything this proposal aims to achieve can already be accomplished with current, though _verbose and error-prone_, language features.

```ts
try {
  // try expression
} catch (error) {
  // catch code
}

// or

promise // try expression
  .catch((error) => {
    // catch code
  })
```

is equivalent to:

```ts
const [error, data] ?= expression

if (error) {
  // catch code
} else {
  // try code
}
```

<br />

## Similar Prior Art

This pattern is architecturally present in many languages:

- **Go**
  - [Error Handling](https://go.dev/blog/error-handling-and-go)
- **Rust**
  - [`?` Operator](https://doc.rust-lang.org/rust-by-example/error/result/enter_question_mark.html#introducing-)
  - [`Result` Type](https://doc.rust-lang.org/rust-by-example/error/result.html#result)
- **Swift**
  - [The `try?` Operator](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/errorhandling/#Converting-Errors-to-Optional-Values)
- **Zig**
  - [`try` Keyword](https://ziglang.org/documentation/0.10.1/#try)
- _And many others..._

While this proposal cannot offer the same level of type safety or strictness as these languages—due to JavaScript's dynamic nature and the fact that the `throw` statement can throw anything—it aims to make error handling more consistent and manageable.

<br />

## What This Proposal Does Not Aim to Solve

1. **Strict Type Enforcement for Errors**: The `throw` statement in JavaScript can throw any type of value. This proposal does not impose type safety on error handling and will not introduce types into the language. It also will not be extended to TypeScript. For more information, see [microsoft/typescript#13219](https://github.com/Microsoft/TypeScript/issues/13219).

2. **Automatic Error Handling**: While this proposal facilitates error handling, it does not automatically handle errors for you. You will still need to write the necessary code to manage errors; the proposal simply aims to make this process easier and more consistent.

<br />

## Current Limitations

While this proposal is still in its early stages, we are aware of several limitations and areas that need further development:

1. **Nomenclature for `Symbol.result` Methods**: We need to establish a term for objects and functions that implement `Symbol.result` methods. Possible terms include _Resultable_ or _Errorable_, but this needs to be defined.

2. **Usage of `this`**: The behavior of `this` within the context of `Symbol.result` has not yet been tested or documented. This is an area that requires further exploration and documentation.

3. **Handling `finally` Blocks**: There are currently no syntax improvements for handling `finally` blocks. However, you can still use the `finally` block as you normally would:

```ts
try {
  // try code
} catch {
  // catch errors
} finally {
  // finally code
}

// Needs to be done as follows

const [error, data] ?= action()

try {
  if (error) {
    // catch errors
  } else {
    // try code
  }
} finally {
  // finally code
}
```

<br /> -->

## Help Us Improve This Proposal

This proposal is in its early stages, and we welcome your input to help refine it. Please feel free to open an issue or submit a pull request with your suggestions.

**_Any contribution is welcome!_**

<br />

## Authors

- [Arthur Fiorette](https://github.com/arthurfiorette) <sub>([X](https://x.com/arthurfiorette))</sub>

<br />

## Inspiration

- [This tweet from @LeaVerou](https://x.com/LeaVerou/status/1819381809773216099)
- The frequent oversight of error handling in JavaScript code.
- [Effect TS Error Management](https://effect.website/docs/guides/error-management)
- The [`tuple-it`](https://www.npmjs.com/package/tuple-it) npm package, which introduces a similar concept but modifies the `Promise` and `Function` prototypes—an approach that is less ideal.

<br />

## License

This proposal is licensed under the [MIT License](./LICENSE).

<br />
