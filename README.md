<br />

<h1>ECMAScript Try Expressions</h1>

> [!WARNING]  
> After extensive discussion and feedback, the proposal was renamed from `Safe Assignment Operator` to `Try Expressions`.

<br />

<div align="center">
  <img src="./assets/banner.png" alt="ECMAScript Try Expressions Proposal" />
</div>

<br />

This proposal aims to address the ergonomic challenges of managing multiple, often nested, `try/catch` blocks that are necessary for handling operations that may fail at various points.

Only the `catch (error) {}` block represents actual control flow, while no program state inherently depends on being inside a `try {}` block. Therefore, forcing the successful flow into nested blocks is not ideal.

<hr />
<br />

- [Try/Catch Is Not Enough](#trycatch-is-not-enough)
- [What This Proposal Does Not Aim to Solve](#what-this-proposal-does-not-aim-to-solve)
- [Try Operator](#try-operator)
  - [Rules for `try` expressions:](#rules-for-try-expressions)
- [Result class](#result-class)
- [Why Not `data` First?](#why-not-data-first)
- [The Need for an `ok` Value](#the-need-for-an-ok-value)
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

With the proposed `Try Expressions`, the same function can be rewritten as:

```js
async function handle(request, reply) {
  const userInfo = try await cache.getUserInfo(request.id)

  if (!userInfo.ok) {
    logger.error(error, "Maybe DB is down?")
    return reply.status(500).send({ error: "Could not get user info" })
  }

  const posts = try await db.getPosts(userInfo.authorId)

  if (!posts.ok) {
    logger.error(error, "Anonymous user behavior not implemented yet")
    return reply.status(500).send({ error: "Could not get posts" })
  }

  const comments =try await db.getComments(posts.map((post) => post.id))

  if (!comments.ok) {
    logger.error(error, "Posts without comments not implemented yet")
    return reply.status(500).send({ error: "Could not get comments" })
  }

  // No need for reassignable variables or nested try/catch blocks

  // Do something with comments before returning
  return reply.send({ userInfo, posts, comments })
}
```

The `try` expressions provide significant flexibility and arguably result in more readable code. A `try` expression is a statement that can be used wherever a statement is expected, allowing for concise and readable error handling.

<br />

## What This Proposal Does Not Aim to Solve

1. **Strict Type Enforcement for Errors**: The `throw` statement in JavaScript can throw any type of value. This proposal does not impose type safety on error handling and will not introduce types into the language. For more information, see [microsoft/typescript#13219](https://github.com/Microsoft/TypeScript/issues/13219). _(This also means no generic error type for [Result](#result-class))_

2. **Automatic Error Handling**: While this proposal facilitates error handling, it does not automatically handle errors for you. You will still need to write the necessary code to manage errors the proposal simply aims to make this process easier and more consistent.

<br />

## Try Operator

The `try` operator consists of the `try` keyword followed by an expression. Its result is an instance of the [`Result`](#result-class).

### Rules for `try` expressions:

1. **`try` expressions cannot be inlined**, similar to `throw`, `return`, and `await`.

   ```js
   array.map((fn) => try fn()).filter((result) => result.ok) // Syntax error!
   ```

2. **Expressions are evaluated in a self-contained `try/catch` block**.

   ```js
   const result = try expr1
   ```

   This is "equivalent" to:

   ```js
   let result
   try {
     result = Result.ok(expr1)
   } catch (error) {
     result = Result.error(error)
   }
   ```

3. **Any valid expression can be used**, but `try` expressions cannot nest.

   ```js
   const result = try data?.someProperty.anotherFunction?.(await someData()).andAnotherOne()
   ```

   This is "equivalent" to:

   ```js
   let result
   try {
     result = Result.ok(
       data?.someProperty.anotherFunction?.(await someData()).andAnotherOne()
     )
   } catch (error) {
     result = Result.error(error)
   }
   ```

4. **`try await` follows the same rules as other expressions**.

   ```js
   let result = try await fetch("https://api.example.com/data")
   ```

   This is "equivalent" to:

   ```js
   let result
   try {
     result = Result.ok(await fetch("https://api.example.com/data"))
   } catch (error) {
     result = Result.error(error)
   }
   ```

5. **Statements like `throw` and `using` are not valid in `try` expressions**.

   ```js
   let result = try throw new Error("Something went wrong") // Syntax error!
   let result = try using resource = new Resource() // Syntax error!
   ```

   This is because their "equivalent" would also result in a syntax error:

   ```js
   let result
   try {
     result = Result.ok(throw new Error("Something went wrong")) // Syntax error!
   } catch (error) {
     result = Result.error(error)
   }
   ```

<br />

## Result class

<br />

## Why Not `data` First?

In Go, the convention is to place the data variable first, and you might wonder why we don't follow the same approach in JavaScript. In Go, this is the standard way to call a function. However, in JavaScript, we already have the option to use `const data = fn()` and choose to ignore the error, which is precisely the issue this proposal seeks to address.

If someone is using the `try` expression, it is because they want to ensure they handle errors and avoid neglecting them. Placing the data first would undermine this principle by prioritizing the result over error handling.

```ts
// Ignores errors!
const data = fn();

// It's easy to forget to handle the error
const [data] = try fn();

// This is the correct approach
const [ok, error, data] = try fn();
```

If you want to suppress the error (which is **different** from ignoring the possibility of a function throwing an error), you can do the following:

```ts
// This suppresses the `ok` and `error` (ignores them and doesn’t re-throw)
const [,, data] = try fn();
```

This approach is explicit and readable, as it acknowledges the possibility of an error while indicating that you do not care about it.

The above method, often referred to as "try-catch calaboca" (a Brazilian term), can also be written as:

```ts
let data
try {
  data = fn()
} catch {}
```

A detailed discussion about this topic is available at [GitHub Issue #13](https://github.com/arthurfiorette/try-expressions/issues/13) for those interested.

<br />

## The Need for an `ok` Value

The idea of `throw x` doing _anything_ other than throwing `x` is inherently flawed. Wrapping the `error` in an object disregards this principle and introduces unnecessary ambiguity.

Consider the following pseudocode, which might seem harmless but is actually risky:

```js
function doWork() {
  if (check) {
    throw createException(Errors.SOMETHING_WENT_WRONG);
  }

  return work();
}

const [error, data] = try doWork();

if (!error) {
  user.send(data);
}
```

There is no guarantee that `createException` always returns an exception. For example, someone could mistakenly write `throw null` or `throw undefined`, both of which are valid but undesired JavaScript code.

Even though such cases are uncommon, they can occur. The `ok` value is crucial to mitigate these runtime risks effectively.

For a more in-depth explanation of this decision, refer to [GitHub Issue #30](https://github.com/arthurfiorette/try-expressions/issues/30).

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
