<h1>ECMAScript Try Operator</h1>

<br />

> [!TIP]  
> You can test the runtime aspect of this proposal and its ergonomics today! Install our reference `Result` class implementation from NPM:
>
> [`npm install try`](https://www.npmjs.com/package/try)

<br />

```js
const result = try JSON.parse(input)

// Can be destructured
const { ok, error, value } = try await fetch("/api/users")
const [ok, fetchErr, res] = try fs.readFileSync("data.txt")
```

<br />

This proposal addresses the ergonomic challenges of managing multiple, often nested, `try/catch` blocks necessary for handling operations that may fail at various points.

The try block needlessly encloses the protected code in a block. This often prevents straightforward `const` assignment patterns and can reduce readability and static analysis through additional nesting. The `catch (error) {}` branch is usually where control-flow divergence happens, while the successful path often just assigns a variable.

The solution is to add a `try <expression>` operator, a syntax similar to `await <expression>`, which catches any error that occurs when executing its expression and returns it as a value to the caller.

JavaScript has no existing equivalent for in-place exception-to-value conversion without using executor callback arguments, which force code to cross function boundaries and create closures.

<br />

- [Status](#status)
- [Authors](#authors)
- [Try/Catch Is Not Enough](#trycatch-is-not-enough)
- [The rules of `try...catch` must be maintained](#the-rules-of-trycatch-must-be-maintained)
  - [The Need for an `ok` Value](#the-need-for-an-ok-value)
  - [No Flattening](#no-flattening)
- [Caller vs Callee: Using Result as a Return Type](#caller-vs-callee-using-result-as-a-return-type)
- [Try Operator](#try-operator)
  - [Expressions are evaluated in a self-contained `try/catch` block](#expressions-are-evaluated-in-a-self-contained-trycatch-block)
  - [Can be inlined](#can-be-inlined)
  - [Any valid expression can be used](#any-valid-expression-can-be-used)
    - [`await` is not a special case](#await-is-not-a-special-case)
  - [Statements are not expressions](#statements-are-not-expressions)
  - [Never throws](#never-throws)
  - [Parenthesis Required for Object Literals](#parenthesis-required-for-object-literals)
  - [Void Operations](#void-operations)
  - [Precedence and Parsing Notes](#precedence-and-parsing-notes)
  - [Sharp Edges and Hazards](#sharp-edges-and-hazards)
- [Result Class](#result-class)
  - [Reference Implementation](#reference-implementation)
  - [Instance Structure](#instance-structure)
  - [Short Forms](#short-forms)
  - [Manual Creation](#manual-creation)
  - [`try()` static method](#try-static-method)
- [Interop and Realms](#interop-and-realms)
- [What This Proposal Does Not Aim to Solve](#what-this-proposal-does-not-aim-to-solve)
  - [Type-Safe Errors](#type-safe-errors)
  - [Automatic Error Handling](#automatic-error-handling)
- [Why Not `data` First?](#why-not-data-first)
- [A Case for Syntax](#a-case-for-syntax)
- [Why This Belongs in the Language](#why-this-belongs-in-the-language)
- [Evidence Plan](#evidence-plan)
- [Help Us Improve This Proposal](#help-us-improve-this-proposal)
- [Inspiration](#inspiration)
- [License](#license)

<br />

## Status

**Stage:** 0 \
**Champion:** _Actively looking for one_

_For more information see the [TC39 proposal process](https://tc39.es/process-document/)._

<br />

## Authors

- [Arthur Fiorette](https://github.com/arthurfiorette) <sub>([X](https://x.com/arthurfiorette))</sub>
- [Arlen Beiler](https://github.com/Arlen22)

<br />

## Try/Catch Is Not Enough

<!-- Credits to https://x.com/LeaVerou/status/1819381809773216099 -->

The `try {}` block introduces additional block scoping around non-exceptional flow. Unlike loops or conditionals, it does not represent a distinct program state that must be isolated.

On the other hand, the `catch {}` block **is** genuine alternate control flow, making its scoping relevant.

Since `catch` explicitly handles exceptions, encapsulating exception-handling logic in a dedicated block makes sense. In many cases, however, the successful flow does not benefit from extra lexical nesting.

Consider a simple function like this:

```js
function getPostInfo(session, postSlug, cache, db) {
  const user = cache.getUser(session.userId)

  const post = db.selectPost(postSlug, user)
  const comments = db.selectComments(post.id, user)

  return { post, comments }
}
```

But **production code is rarely this clean**. Error handling quickly forces a messier structure:

```js
function getPostInfo(session, postSlug, cache, db) {
  let user

  // Requires a dedicated error handler
  try {
    user = cache.getUser(session.userId)
  } catch (error) {
    otel.capture(error, Operations.GET_SELF)
    session.logout()
    throw new Error("Invalid session")
  }

  // No recovery if selectPost fails
  try {
    const post = db.selectPost(postSlug, user)

    let comments = []

    // The post must still be returned even if fetching comments fails
    try {
      comments = db.selectComments(post.id, user)
    } catch (error) {
      otel.capture(error, Operations.JOIN_POST_COMMENTS)
    }

    return { post, comments }
  } catch (error) {
    otel.capture(error, Operations.GET_POST)
    throw new Error("Could not get post")
  }
}
```

In this example, the `try` blocks introduce additional nesting and prevent the protection a `const` declaration would provide.

It also tends to interfere with static analysis tools, forcing developers to look for alternate solutions.

Instead, using the proposed `try` operator simplifies the function:

```js
function getPostInfo(session, postId, cache, db) {
  const [userOk, userErr, user] = try cache.getUser(session.userId)

  // Requires a dedicated error handler
  if (!userOk) {
    session.logout()

    otel.capture(userErr, Operations.GET_SELF)
    throw new Error("Invalid session")
  }

  const [postOk, postErr, post] = try db.selectPost(postId, user)

  // No recovery if selectPost fails
  if (!postOk) {
    otel.capture(postErr, Operations.GET_POST)
    throw new Error("Could not get post")
  }

  const [commentsOk, commentsErr, comments = []] = try db.selectComments(post.id, user)

  // The post must still be returned even if fetching comments fails
  if (!commentsOk) {
    otel.capture(commentsErr, Operations.JOIN_POST_COMMENTS)
  }

  return { post, comments }
}
```

This approach often improves readability by cleanly separating the happy path from error handling.

Control flow remains linear, making it easier to follow, while only exception paths require explicit branching.

And because the try operator returns a defined shape, static analysis tools can easily understand it.

The result is a more structured, maintainable function where failures are handled concisely without unnecessary indentation.

<br />

## The rules of `try...catch` must be maintained

An operator behaves like a function call with arguments and a return value. The `await` operator, for instance, takes a single argument (the code it awaits) and "returns" the value a promise resolves to, or "throws" the value a promise rejects with. 

Here, the `try` operator also takes a single argument (the code it protects) and "returns" a `Result`.

> [!TIP]  
>
> A shorthand notation for `Result` in this proposal is `Result(true, value)` and `Result(false, error)`, representing `[true, undefined, value]` and `[false, error, undefined]`, respectively.

The `try` operator never throws, and it catches anything the code in its expression throws during execution. Just like the `try {}` block, it does NOT catch syntax errors since those occur when the file is loaded.

The `try` operator must always maintain equivelance to the `try...catch` block. 

- `try {}` - when the try operator returns `[true, undefined, value]`.
- `catch (e) {}` - when the try operator returns `[false, error, undefined]`.
- `finally {}` - statements following the try operator. 


### The Need for an `ok` Value

In JavaScript, `throw x` throws `x`. There is no wrapping or any other processing, so `throw undefined` is perfectly valid.

Because code can both throw `undefined` and return `undefined`, there is no way to tell whether it was successful based on `error` and `value` alone. No matter how undesirable it is to throw `undefined`, it is completely valid JavaScript. In order to maintain the guarantees of the `try...catch` block, there has to be some way to tell the difference between a thrown value and a returned value that still allows `undefined` to be a thrown value. 

The most obvious solution is to add a boolean to the result. 

### No Flattening

Nested Results are not flattened, whether its a value or error.

This is intentional. For the `try` operator to have the same guarantees as `try...catch`, it must let the user determine whether an expression throws or completes. Flattening a Result would blur the clean boundary between successful execution and failed execution, meaning the user could not distinguish between _returning_ `Result(false)` and actually throwing an error, or between _throwing_ `Result(true)` and actually returning a value. 

A user can always flatten the result if they want, but there's no way for them to _unflatten_ it if they need to know the difference. 

<br />

## Caller vs Callee: Using Result as a Return Type

This proposal starts from a simple fact: JavaScript already has a large ecosystem of `throw`-based APIs. The goal is not to replace exception propagation, but to make exception-to-value conversion cheap exactly where the caller wants it. That lets callers choose the boundary where errors stop unwinding and start being handled as values.

JavaScript already follows a similar model for asynchronous code. Promise rejections propagate up the `await` stack until the caller chooses a boundary with `.catch()`. The `try` operator brings that same caller-controlled inline exception-to-value conversion to synchronous code.

This is especially the case in server-style request handling. If `db.connect()`, `db.select()`, or `normalize()` throws, the practical outcome may be to abort the request, log the failure, and show a generic error page. Similar patterns appear in parser and validation code, where unexpected failures often just bubble until a specific boundary chooses to intercept them.

Consider a call chain where `getUser()` calls `db.connect()` and then `db.select()`. If none return `Result`, the stack will simply unwind automatically to whatever point that the caller decides.

```js
function getUser(id, request, response) {
  const result = try normalize(db.select(db.connect(), id));

  if (!result.ok) {
    throw new ServerError(result.error, request, response);
  } else {
    return response.send(JSON.stringify(result.value)).end();
  }
```

Giving the caller control over exactly where the stack unwinds to is often more useful than returning a `Result` directly.

Returning a `Result` can force callers to acknowledge errors in ways JSDoc cannot. That benefit is real. The cost is that developers end up checking and rethrowing failures that would otherwise bubble naturally. Forcing the caller to check a result only to rethrow it is rarely necessary.

If our database returned `Result` for every operation, it might force our developer to do something like this:

```js
// Every function must check and forward errors.

function getUser(id, request, response) {
  const connResult = db.connect()

  if (!connResult.ok) {
    throw new ServerError(connResult.error, request, response);
  }

  const userResult = db.select(connResult.value, id)

  if (!userResult.ok) {
    throw new ServerError(userResult.error, request, response);
  }

  const normResult = normalize(userResult.value);

  if (!normResult.ok) {
    throw new ServerError(normResult.error, request, response);
  }

  return response.send(JSON.stringify(normResult.value)).end();
}
```

This is reminiscent of Go's `if err != nil { return err }`, even though Go's tuples and JavaScript `Result` objects are not otherwise the same abstraction. Sometimes that repetition is acceptable. Sometimes it is just redundant plumbing around behavior that would otherwise happen automatically.

Nothing prevents developers from returning a `Result`, but the `try` operator solves the biggest reason why JavaScript developers often want to return a `Result` instead of throwing: the wonky and egregious code pathing and static-analysis breaking that is currently required.

Returning a `Result` is still valid and useful when callers should acknowledge failures explicitly and the failure information itself is part of the API contract. That is more likely when failures carry structured, standardized data, such as the success or failure of a financial transaction or an HTTP request that successfully got a `404` response.

<br />

## Try Operator

The `try` operator consists of the `try` keyword followed by an expression. It results in an instance of the [`Result`](#result-class).

<details>

<summary>
All of its usages are just a combination of the above said rules.
</summary>

```js
// wraps the result of `something()` in a Result
const a = try something()

// Result can be destructured as an object
const { ok, error, value } = try something()

// Result is also iterable
const [ok, err, val] = try something()

// Result still is iterable
const [[ok, err, val]] = [try something()]

// Result[]
array.map(fn => try fn())

// yields Result
yield try something()

// Result<T> where T is the argument of iterator().next(arg: T) but also captures
// any error thrown by something()
try yield something()

// Result<Awaited<ReturnType<typeof something>>>
try await something()

// Catches potential TypeError: Right-hand side of 'instanceof' is not an object
try (a instanceof b)

// Result<boolean> instanceof boolean
(try a) instanceof Result

// Result<Result<Result<Result<Result<number>>>
const a = try (try (try (try (try 1))))
```

</details>

### Expressions are evaluated in a self-contained `try/catch` block

```js
const result = try expression
```

This is "equivalent" to:

```js
let _result
try {
  _result = Result.ok(expression)
} catch (error) {
  _result = Result.error(error)
}
const result = _result
```

### Can be inlined

Similar to `void`, `typeof`, `yield`, and `new`:

```js
array.map((fn) => try fn()).filter((result) => result.ok)
```

### Any valid expression can be used

```js
const result = try data?.someProperty.anotherFunction?.(await someData()).andAnotherOne()
```

This is "equivalent" to:

```js
let _result
try {
  _result = Result.ok(
    data?.someProperty.anotherFunction?.(await someData()).andAnotherOne(),
  )
} catch (error) {
  _result = Result.error(error)
}
const result = _result
```

#### `await` is not a special case

```js
const result = try await fetch("https://arthur.place")
```

Which is only valid in async contexts and equates to:

```js
let _result
try {
  _result = Result.ok(await fetch("https://arthur.place"))
} catch (error) {
  _result = Result.error(error)
}
const result = _result
```

### Statements are not expressions

```js
const result = try throw new Error("Something went wrong") // Syntax error!
const result = try using resource = new Resource() // Syntax error!
```

This is because their "equivalent" would also result in a syntax error:

```js
let _result
try {
  _result = Result.ok(throw new Error("Something went wrong")) // Syntax error!
} catch (error) {
  _result = Result.error(error)
}
const result = _result
```

A detailed discussion about this topic is available at [GitHub Issue #54](https://github.com/arthurfiorette/proposal-try-operator/issues/54) for those interested.

### Never throws

The `try` operator converts any ECMAScript throw produced while evaluating its operand expression into a `Result.error(...)` value:

```js
const [ok, error, result] = try some.thing()
```

For example:

- If `some` is `undefined`.
- If `thing` is not a function.
- If accessing the `thing` property on `some` throws an error.
- Any other exception that can arise on that line of code.

All these thrown values are captured and encapsulated in the returned `Result`.

As with the try block, syntax and other fatal errors are out of scope.

### Parenthesis Required for Object Literals

When using `try` with an object literal, the literal must be enclosed in parenthesis:

```js
const result = try ({ data: await work() })
```

This behavior mirrors how JavaScript differentiates blocks and object literals:

<!-- prettier-ignore -->
   ```js
    { a: 1 }  // empty block with a label
   ({ a: 1 }) // object with a key `a` and a number `1`
   ```

A detailed discussion about this topic is available at [GitHub Issue #55](https://github.com/arthurfiorette/proposal-try-operator/issues/55) for those interested.

### Void Operations

In scenarios where the successful result of an operation is not needed, it can be safely ignored:

```js
function work() {
  try fs.unlinkSync("temp.txt")
}
```

This behavior aligns with common patterns, such as using `await` on asynchronous operations where the result is not utilized:

```js
await fs.promises.unlink("temp.txt")
```

While it is valid to ignore the result, tools like TypeScript ESLint may introduce similar rules, such as [`no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises/), to encourage developers to explicitly indicate that the result is being ignored. A common workaround to provide a visual cue is to use `void` alongside `try`:

```js
function work() {
  // This approach works without modification and provides a clear hint
  void try fs.unlinkSync("temp.txt")
}
```

Ignoring a `Result` should be treated as an explicit choice. In critical code paths, prefer handling or rethrowing to avoid accidentally swallowing failures.

### Precedence and Parsing Notes

This proposal keeps `try` expression-oriented. At Stage 0, the core goal is to validate ergonomics and semantics before final grammar tuning, but the intended parsing model is straightforward:

- `try` applies to a single operand expression, similar in spirit to other expression-position operators.
- `try await expr` is parsed as `try (await expr)`.
- Parentheses disambiguate object literals and can always be used to make intent explicit.
- Existing `try { ... } catch { ... }` statement form is unchanged.

As the proposal advances, this section will be replaced by fully normative grammar and precedence text.

### Sharp Edges and Hazards

This operator is intentionally small and does not replace all error-handling patterns.

- `try fetch()` is not the same as `try await fetch()`. Rejections are caught when awaited.
- Ignoring a `Result` can hide failures if done carelessly.
- Catching all throws at expression level may also catch programmer mistakes (for example `TypeError`) unless code distinguishes and rethrows.
- For shared policies (global retries, framework boundaries, platform-level telemetry), handling may belong at a higher boundary.

<br />

## Result Class

The `try` operator evaluates an expression and returns an instance of the `Result` class, which encapsulates the outcome of the operation.

### Reference Implementation

To validate the ergonomics and utility of this proposal, a spec-compliant, runtime-only implementation of the `Result` class has been published to npm as the [`try`](https://www.npmjs.com/package/try) package. This package provides a `t()` function that serves as a polyfill for the `try` operator's runtime behavior, allowing developers to experiment with the core pattern.

```js
import { t } from "try"

const [ok, err, val] = await t(fetch, "https://arthur.place")
```

You can check the published package at [npmjs.com/package/try](https://www.npmjs.com/package/try) or [github.com/arthurfiorette/try](https://github.com/arthurfiorette/try) and contribute to its development.

### Instance Structure

A `Result` instance always contains a boolean `ok` property that indicates the outcome.

- If `ok` is `true`, the instance also has a `value` property containing the successful result.
- If `ok` is `false`, it has an `error` property containing the thrown exception.

Crucially, a success result does not have an `error` property, and a failure result does not have a `value` property. This allows for reliable checks like `'error' in result`.

```js
const result = try something()

if (result.ok) {
  console.log(result.value)
} else {
  console.error(result.error)
}
```

### Short Forms

Since `Result` is a regular object, it supports object destructuring:

```js
const { ok, error, value: user } = try User.parse(myJson)
```

`Result` instances are also iterable, yielding their state in the order `[ok, error, value]`. This is particularly useful when combining multiple results, as positional destructuring allows easy renaming:

```js
const [userOk, userErr, user] = try User.parse(myJson)
const [postOk, postErr, post] = try db.selectPost(postId, user)
```

Both forms consume the same `Result` object. Object destructuring accesses named properties, while iterable destructuring enables positional renaming when multiple results are in scope.

### Manual Creation

While the `try` operator is the primary source of `Result` instances, they can also be created manually using static methods. This is useful for testing or for bridging with APIs that do not use exceptions.

```js
// Create a successful result
const success = Result.ok(42)

// Create a failure result
const failure = Result.error(new Error("Operation failed"))
```

### `try()` static method

It also includes a static `Result.try()` method, which serves as the runtime foundation for the `try` operator. This method wraps a function call, catching any synchronous exceptions or asynchronous rejections and returning a `Result` or `Promise<Result>`, respectively.

The proposed `try expression` syntax is essentially an ergonomic improvement over the more verbose `Result.try(() => expression)`, removing the need for a function wrapper.

## Interop and Realms

This proposal introduces a shared error-outcome value intended to work reliably across boundaries.

At Stage 0, the interoperability goals are:

- Cross-realm friendliness: values produced in one realm (for example iframe/vm contexts) should still be recognizable as `Result` in another.
- Stable detection: developers should not have to rely exclusively on `instanceof` checks that can be realm-sensitive.
- Predictable shape: `ok` is always present, with mutually exclusive `value` and `error` fields.

The exact branding and detection details are expected to be finalized in later stages, together with committee feedback on best cross-realm practices.

## What This Proposal Does Not Aim to Solve

### Type-Safe Errors

The `throw` statement in JavaScript can throw any type of value. This proposal does not impose nor propose any kind of safety around error handling.

- No generic error type for the proposed [Result](#result-class) class will be added.
- No catch branching based on error type will be added. See [GitHub Issue #43](https://github.com/arthurfiorette/proposal-try-operator/issues/43) for more information.
- No way to annotate a callable to specify the error type it throws will be added.

For more information, also see [microsoft/typescript#13219](https://github.com/Microsoft/TypeScript/issues/13219).

### Automatic Error Handling

While this proposal facilitates error handling, it does not automatically handle errors for you. You will still need to write the necessary code to manage errors the proposal simply aims to make this process easier and more consistent.

<br />

## Why Not `data` First?

In Go, the convention is to place the data variable first, and you might wonder why we don't follow the same approach in JavaScript. In Go, this is the standard way to call a function. However, in JavaScript, we already have the option to use `const data = fn()` and choose to ignore the error, which is precisely the issue this proposal seeks to address.

If someone is using a `try` statement, it is because they want to ensure they handle errors and avoid neglecting them. Placing the data first would undermine this principle by prioritizing the result over error handling.

```js
// This line doesn't acknowledge the possibility of errors being thrown
const data = fn()

// It's easy to forget to add a second error parameter
const [data] = try fn()

// This approach gives all clues to the reader about the 2 possible states
const [ok, error, data] = try fn()
```

If you want to suppress the error (which is **different** from ignoring the possibility of a function throwing an error), you can do the following:

```js
// This suppresses a possible error (Ignores and doesn't re-throw)
const [ok, , data] = try fn()
```

This approach is explicit and readable, as it acknowledges the possibility of an error while indicating that you do not care about it.

The above method, can also be written as:

```js
let ok = true
let data
try {
  data = fn()
} catch {
  ok = false
}
```

A detailed discussion about this topic is available at [GitHub Issue #13](https://github.com/arthurfiorette/proposal-try-operator/issues/13) for those interested.

<br />

## A Case for Syntax

This proposal intentionally combines the `try` operator with the `Result` class because each part motivates the other. The `try` operator provides a useful pattern for safely catching synchronous function calls without resorting to block scope hoisting (similar to how Promise `.catch` handles async rejections by returning a user-defined value).

At Stage 0, this is presented as a design hypothesis to validate with feedback and real-world usage.

It has been suggested that a runtime-only proposal for the `Result` class might face less resistance within the TC39 process. While this strategic viewpoint is understood, this proposal deliberately presents a unified feature. 

Without the `try` operator, the `Result` class is just one of many possible library implementations, not a definitive language feature. Separating the runtime from the syntax severs the solution from its motivating problem. It would ask the committee to standardize a `Result` object whose design is justified by a syntax **that doesn't yet exist**.

We believe the feature must be evaluated on its complete ergonomic and practical merits, which is only possible when the syntax and runtime are presented together.

<br />

## Why This Belongs in the Language

A proposal doesn’t need to introduce a feature that is entirely impossible to achieve otherwise. In fact, most recent proposals primarily reduce the complexity of tasks that are already achievable by providing built-in conveniences.

Like earlier ergonomics proposals such as optional chaining (`?.`) and nullish coalescing (`??`), this proposal targets a recurring pattern that appears repeatedly in userland. Unlike those features, it also introduces a standard error-outcome container. 

At this stage of the proposal it is not intended to cover every variation of existing libraries out there, but simply to provide the features required for the `try` operator to work. 

## Evidence Plan

Because this proposal is at **Stage 0**, proving the problem and tradeoffs has priority over fully frozen specification text. This section will evolve as the proposal gains a champion and advances, but the initial plan is to:

- Gather real examples of nested `try/catch` in production JavaScript and show equivalent `try <expression>` refactors.
- Compare before/after readability in terms of nesting depth and branching structure.
- Classify where this operator prevents mistakes vs where it could hide mistakes if misused.
- Catalog existing tuple/result wrappers and incompatibilities to justify standardization value.
- Collect examples of mixed-channel code (`Result` return plus `throw`/rejection) to evaluate how common those boundaries are and where explicit normalization is preferable.

<br />

## Help Us Improve This Proposal

This proposal is in its early stages, and we welcome your input to help refine it. Please feel free to open an issue or submit a pull request with your suggestions.

**_Any contribution is welcome!_**

<br />

## Inspiration

- [This tweet from @LeaVerou](https://x.com/LeaVerou/status/1819381809773216099)
- The frequent oversight of error handling in JavaScript code.
- [Effect TS Error Management](https://effect.website/docs/error-management/two-error-types/)
- The [`tuple-it`](https://www.npmjs.com/package/tuple-it) npm package, which introduces a similar concept but modifies the `Promise` and `Function` prototypes.
- [Szymon Wygnański](https://finalclass.net) for donating the `try` package name on NPM to host the reference implementation of this proposal.
- The [first concept](https://github.com/arthurfiorette/proposal-try-operator/tree/old/proposal-safe-assignment-operator) of this proposal, called "Safe Assignment Operator".

<br />

## License

This proposal is licensed under the [MIT License](./LICENSE).

<br />
