/// <reference path="./polyfill.d.ts" />

/** @type {ResultConstructor} */
class Result {
  constructor(ok, error, value) {
    this.ok = ok
    this.error = error
    this.value = value
  }

  *[Symbol.iterator]() {
    yield this.ok
    yield this.error
    yield this.value
  }

  static ok(value) {
    return new Result(true, undefined, value)
  }

  static error(error) {
    return new Result(false, error, undefined)
  }

  static try(fnOrPromise, ...args) {
    if (fnOrPromise instanceof Promise) {
      return fnOrPromise.then(Result.ok, Result.error)
    }

    try {
      const result = fnOrPromise.apply(undefined, args)

      if (result instanceof Promise) {
        return result.then(Result.ok, Result.error)
      }

      return Result.ok(result)
    } catch (error) {
      return Result.error(error)
    }
  }
}
