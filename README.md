<br />

<h1>ECMAScript Try Operator</h1>

> [!WARNING]  
> After extensive discussion and feedback, the proposal was renamed from `Safe Assignment Operator` to `Try Operator`. _Click here to view the [original proposal](https://github.com/arthurfiorette/proposal-try-operator/tree/proposal-safe-assignment-operator)._

<br />

<div align="center">
  <img src="./assets/banner.png" alt="ECMAScript Try Operator Proposal" />
</div>

<br />

This proposal aims to address the ergonomic challenges of managing multiple, often nested, `try/catch` blocks that are necessary for handling operations that may fail at various points.

Only the `catch (error) {}` block represents actual control flow, while no program state inherently depends on being inside a `try {}` block. Therefore, forcing the successful flow into nested blocks is not ideal.

<hr />
<br />

- [Try/Catch Is Not Enough](#trycatch-is-not-enough)
- [What This Proposal Does Not Aim to Solve](#what-this-proposal-does-not-aim-to-solve)
- [Try Operator](#try-operator)
  - [Expressions are evaluated in a self-contained `try/catch` block](#expressions-are-evaluated-in-a-self-contained-trycatch-block)
  - [Can be inlined.](#can-be-inlined)
  - [Any valid expression can be used](#any-valid-expression-can-be-used)
    - [`await` is not an exception](#await-is-not-an-exception)
  - [Statements are not expressions](#statements-are-not-expressions)
  - [Never throws](#never-throws)
  - [Parenthesis Required for Object Literals](#parenthesis-required-for-object-literals)
  - [Void Operations](#void-operations)
- [Result class](#result-class)
- [Why Not `data` First?](#why-not-data-first)
- [The Need for an `ok` Value](#the-need-for-an-ok-value)
- [Caller's Approach](#callers-approach)
- [Why a Proposal?](#why-a-proposal)
- [Help Us Improve This Proposal](#help-us-improve-this-proposal)
- [Authors](#authors)
- [Inspiration](#inspiration)
- [License](#license)

<br />

## Try/Catch Is Not Enough

<!-- Credits to https://x.com/LeaVerou/status/1819381809773216099 :) -->

The `try {}` block is often redundant, as its scoping lacks meaningful conceptual significance. It generally acts more as a code annotation than a genuine control flow construct. Unlike true control flow blocks, no program state exists that requires being confined to a `try {}` block.

Conversely, the `catch {}` block **is** genuine control flow, making its scoping relevant and meaningful. According to Oxford Languages, an exception is defined as:

> a person or thing that is excluded from a general statement or does not follow a rule.

Since `catch` handles exceptions, it is logical to encapsulate exception-handling logic in a block to exclude it from the general program flow.

The pseudocode below illustrates the lack of value in nesting the success path within a code block:

```js
async function handle(request, reply) {
  try {
    const userInfo = await cache.getUserInfo(request.id)

    try {
      const posts = await db.getPosts(userInfo.authorId)

      let comments

      // Variables used after error handling must be declared outside the block
      try {
        comments = await db.getComments(posts.map((post) => post.id))
      } catch (error) {
        logger.error(error, "Posts without comments not implemented yet")
        return reply.status(500).send({ error: "Could not get comments" })
      }

      // Do something with comments before returning
      return reply.send({ userInfo, posts, comments })
    } catch (error) {
      logger.error(error, "Anonymous user behavior not implemented yet")
      return reply.status(500).send({ error: "Could not get posts" })
    }
  } catch (error) {
    logger.error(error, "Maybe DB is down?")
    return reply.status(500).send({ error: "Could not get user info" })
  }
}
```

With the proposed `try` statement, the same function can be rewritten as:

```js
async function handle(request, reply) {
  const userInfo = try await cache.getUserInfo(request.id)

  if (!userInfo.ok) {
    logger.error(userInfo.error, "Maybe DB is down?")
    return reply.status(500).send({ error: "Could not get user info" })
  }

  const posts = try await db.getPosts(userInfo.value.authorId)

  if (!posts.ok) {
    logger.error(posts.error, "Anonymous user behavior not implemented yet")
    return reply.status(500).send({ error: "Could not get posts" })
  }

  const comments = try await db.getComments(posts.value.map((post) => post.id))

  if (!comments.ok) {
    logger.error(comments.error, "Posts without comments not implemented yet")
    return reply.status(500).send({ error: "Could not get comments" })
  }

  // No need for reassignable variables or nested try/catch blocks

  // Do something with comments before returning
  return reply.send({ userInfo: userInfo.value, posts: posts.value, comments: comments.value })
}
```

A `try` statement provide significant flexibility and arguably result in more readable code. A `try` statement is a statement that can be used wherever a statement is expected, allowing for concise and readable error handling.

<br />

## What This Proposal Does Not Aim to Solve

1. **Strict Type Enforcement for Errors**: The `throw` statement in JavaScript can throw any type of value. This proposal does not impose type safety on error handling and will not introduce types into the language. For more information, see [microsoft/typescript#13219](https://github.com/Microsoft/TypeScript/issues/13219). _(This also means no generic error type for [Result](#result-class))_

2. **Automatic Error Handling**: While this proposal facilitates error handling, it does not automatically handle errors for you. You will still need to write the necessary code to manage errors the proposal simply aims to make this process easier and more consistent.

<br />

## Try Operator

The `try` operator consists of the `try` keyword followed by an expression. It results in an instance of the [`Result`](#result-class).

<details>

<summary>
All of its usages are just a combination of the above said rules.
</summary>

```js
const a = try something()
const [[ok, err, val]] = [try something()]
const [ok, err, val] = try something()
array.map(fn => try fn())
yield try something()
try yield something()
try await something()
try (a instanceof b)
(try a) instanceof Result
const a = try try try try try try 1
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

### Can be inlined.

Similar to `void`, `typeof`, `yield` and `new`:

```js
array.map((fn) => try fn()).filter((result) => result.ok) // works :)
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
    data?.someProperty.anotherFunction?.(await someData()).andAnotherOne()
  )
} catch (error) {
  _result = Result.error(error)
}
const result = _result
```

#### `await` is not an exception

```js
const result = try await fetch("https://api.example.com/data")
```

This is "equivalent" to:

```js
let _result
try {
  _result = Result.ok(await fetch("https://api.example.com/data"))
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

The `try` operator ensures that no error escapes its scope:

```js
const [ok, error, result] = try some.thing()
```

Regardless of the type of error that might occur, `try` will catch it. For example:

- If `some` is `undefined`.
- If `thing` is not a function.
- If accessing the `thing` property on `some` throws an error.
- Any other exception that can arise on that line of code.

All potential errors are safely caught and encapsulated within the `try` operator expression.

### Parenthesis Required for Object Literals

When using `try` with an object literal, the literal must be enclosed in parenthesis:

```js
const result = try ({ data: await work() })
```

This behavior mirrors how JavaScript differentiates blocks and object literals:

<!-- prettier-ignore -->
   ```js
    { a: 1 } // empty block with a label
   ({ a: 1 }) // object with a key `a` and a number `1`
   ```

A detailed discussion about this topic is available at [GitHub Issue #55](https://github.com/arthurfiorette/proposal-try-operator/issues/55) for those interested.

### Void Operations

In scenarios where the successful result of a operation is not needed, it can be safely ignored:

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

<br />

## Result class

> Please see [`polyfill.d.ts`](./polyfill.d.ts) and [`polyfill.js`](./polyfill.js) for a basic implementation of the `Result` class.

The `Result` class represents the form of the value returned by the `try` operator.

1. **Structure of a `Result` Instance**  
   A `Result` instance contains three properties:

   - **`ok`**: A boolean indicating whether the expression executed successfully.
   - **`error`**: The error thrown during execution, or `undefined` if no error occurred.
   - **`value`**: The data returned from the execution, or `undefined` if an error occurred.

   Example usage:

   ```js
   const result = try something()

   if (result.ok) {
     console.log(result.value)
   } else {
     console.error(result.error)
   }
   ```

2. **Iterable Behavior**  
   A `Result` instance is iterable, enabling destructuring and different naming per case:

   ```js
   const [success, validationError, user] = try User.parse(myJson)
   ```

3. **Manual Creation of a `Result`**  
   You can also create a `Result` instance manually using its constructor or static methods:

   ```js
   // Creating a successful result
   const result = new Result(true, undefined, value)
   const result = Result.ok(value)

   // Creating an error result
   const result = new Result(false, error)
   const result = Result.error(error)
   ```

<br />

## Why Not `data` First?

In Go, the convention is to place the data variable first, and you might wonder why we don't follow the same approach in JavaScript. In Go, this is the standard way to call a function. However, in JavaScript, we already have the option to use `const data = fn()` and choose to ignore the error, which is precisely the issue this proposal seeks to address.

If someone is using a `try` statement, it is because they want to ensure they handle errors and avoid neglecting them. Placing the data first would undermine this principle by prioritizing the result over error handling.

```ts
// This line doesn't acknowledge the possibility of errors being thrown
const data = fn()

// It's easy to forget to add a second error parameter
const [data] = try fn()

// This approach gives all clues to the reader about the 2 possible states
const [ok, error, data] = try fn()
```

If you want to suppress the error (which is **different** from ignoring the possibility of a function throwing an error), you can do the following:

```ts
// This suppresses a possible error (Ignores and doesn't re-throw)
const [ok, , data] = try fn()
```

This approach is explicit and readable, as it acknowledges the possibility of an error while indicating that you do not care about it.

The above method, often referred to as "try-catch calaboca" (a Brazilian term), can also be written as:

```ts
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

## The Need for an `ok` Value

The idea of `throw x` doing _anything_ other than throwing `x` is inherently flawed. Wrapping the `error` in an object disregards this principle and introduces unnecessary ambiguity.

Consider the following pseudocode, which might seem harmless but is actually risky:

```js
function doWork() {
  if (check) {
    throw createException(Errors.SOMETHING_WENT_WRONG)
  }

  return work()
}

const [error, data] = try doWork()

if (!error) {
  user.send(data)
}
```

There is no guarantee that `createException` always returns an exception. Someone could even mistakenly write `throw null` or `throw undefined`, both of which are valid but undesired JavaScript code.

Even though such cases are uncommon, they can occur. The `ok` value is crucial to mitigate these runtime risks effectively.

For a more in-depth explanation of this decision, refer to [GitHub Issue #30](https://github.com/arthurfiorette/proposal-try-operator/issues/30).

<br />

## Caller's Approach

JavaScript has evolved over decades, with countless libraries and codebases built on top of one another. Any new feature that does not consider compatibility with existing code risks negatively impacting its adoption, as refactoring functional, legacy code simply to accommodate a new feature is often an unjustifiable cost.

With that in mind, improvements in error handling can be approached in two ways:

1. **At the caller's level**:

   ```js
   try {
     const result = work()
   } catch (error) {
     console.error(error)
   }
   ```

2. **At the callee's level**:

   ```js
   function work() {
     // Performs some operation

     if (error) {
       return { status: "error", error }
     } else {
       return { status: "ok", data }
     }
   }
   ```

Both approaches achieve the same goal, but the second one requires refactoring all implementations into a new format. This is how languages like Go and Rust handle errors, returning a tuple of an error and a value or a `Result` object, respectively. While the callee-based approach can arguably be better, it succeeded in those languages because it was adopted from the very beginning, rather than introduced as a later addition.

This proposal accounts for this by moving the transformation of errors into values to the **caller** level, preserving the familiar semantics and placement of `try/catch`. This approach ensures backward compatibility with existing code.

Breaking compatibility is unacceptable for platforms like Node.js or libraries. Consequently, a callee-based approach would likely never be adopted for functions like `fetch` or `fs.readFile`, as it would disrupt existing codebases. Ironically, these are precisely the kinds of functions where improved error handling is most needed.

<br />

## Why a Proposal?

A proposal doesn’t need to introduce a feature that is entirely impossible to achieve otherwise. In fact, most recent proposals primarily reduce the complexity of tasks that are already achievable by providing built-in conveniences.

Optional chaining and nullish coalescing are examples of features that could have remained external libraries (e.g., Lodash's `_.get()` for optional chaining and `_.defaultTo()` for nullish coalescing). However, when implemented natively, their usage scales exponentially and becomes a natural part of developers’ workflows. This arguably improves code quality and productivity.

By providing such basic conveniences natively, we:

- Increase consistency across codebases (many NPM packages already implement variations of this proposal, each with its own API and lack of standardization).
- Reduce code complexity, making it more readable and less error-prone.

<br />

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
