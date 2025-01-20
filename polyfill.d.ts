// Impl note: Since its not possible to make iterators return different types based
// on the iteration state (yet) a union with a tuple is the only solution. Once its
// finished, this whole type branching can be removed into a single  object union containing:
// { ok: boolean, error: unknown, value: V, [Symbol.iterator]: () => Iterator<(something)> }
//
// See https://github.com/microsoft/TypeScript/issues/42033

/**
 * Error result type expressed as object
 */
type ErrorObjectResult = { ok: false; error: unknown; value: undefined }

/**
 * Error result type expressed as tuple.
 *
 * - `error` type depends on `useUnknownInCatchVariables` tsconfig option
 */
type ErrorTupleResult = [ok: false, error: unknown, value: undefined]

/**
 * An error result is a object that can be either destructured {@link ErrorObjectResult} or accessed by index {@link ErrorTupleResult}
 */
type ErrorResult = ErrorObjectResult & ErrorTupleResult

/**
 * Value result type expressed as object
 */
type ValueObjectResult<V> = { ok: true; error: undefined; value: V }

/**
 * Value result type expressed as tuple
 */
type ValueTupleResult<V> = [ok: true, error: undefined, value: V]

/**
 * A value result is a object that can be either destructured {@link ValueObjectResult} or accessed by index {@link ValueTupleResult}
 */
type ValueResult<V> = ValueObjectResult<V> & ValueTupleResult<V>

/**
 * A result is a object that can represent the result of either a failed or successful operation.
 */
type Result<V> = ErrorResult | ValueResult<V>

interface ResultConstructor {
  /**
   * Creates a result from a tuple
   *
   * @example
   *
   * new Result(true, undefined, 42)
   * new Result(false, new Error('Something went wrong'))
   */
  new <V>(...args: ValueTupleResult<V> | ErrorTupleResult): Result<V>

  /**
   * Creates a result for a successful operation
   */
  ok<V>(value: V): Result<V>

  /**
   * Creates a result for a failed operation
   */
  error<V>(error: unknown): Result<V>
}

declare const Result: ResultConstructor
