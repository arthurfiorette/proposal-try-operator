/// <reference path="./polyfill.d.ts" />

/** @type {TryResultConstructor} */
class TryResult {
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
    return new TryResult(true, undefined, value)
  }

  static error(error) {
    return new TryResult(false, error, undefined)
  }
}
