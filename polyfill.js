/// <reference path="./polyfill.d.ts" />

/** @type {ResultConstructor} */
class Result {
  ok = false
  error = null
  value = null

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
    return new Result(true, null, value)
  }

  static error(error) {
    return new Result(false, error, null)
  }
}
