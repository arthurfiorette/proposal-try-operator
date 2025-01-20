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
}
