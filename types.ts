// Impl note: Since its not possible to make iterators return different types based
// on the iteration state (yet) a union with a tuple is the only solution. Once its
// finished, this whole type branching can be removed into a single  object union containing:
// { ok: boolean, error: unknown, value: V, [Symbol.iterator]: () => Iterator<(something)> }
//
// See https://github.com/microsoft/TypeScript/issues/42033

/**
 * Error result type expressed as object
 */
type ErrorObjectResult = { ok: false; error: unknown; value: null }

/**
 * Error result type expressed as tuple. `error` type depends on `useUnknownInCatchVariables` tsconfig option
 */
type ErrorTupleResult = [ok: false, error: unknown, value: null]

/**
 * An error result is a object that can be either destructured {@link ErrorObjectResult} or accessed by index {@link ErrorTupleResult}
 */
type ErrorResult = ErrorObjectResult & ErrorTupleResult

/**
 * Value result type expressed as object
 */
type ValueObjectResult<V> = { ok: true; error: null; value: V }

/**
 * Value result type expressed as tuple
 */
type ValueTupleResult<V> = [ok: true, error: null, value: V]

/**
 * A value result is a object that can be either destructured {@link ValueObjectResult} or accessed by index {@link ValueTupleResult}
 */
type ValueResult<V> = ValueObjectResult<V> & ValueTupleResult<V>

/**
 * A result is a object that can represent the result of either a failed or successful operation.
 */
type Result<V> = ErrorResult | ValueResult<V>

// Simple helper function to create a result object (not in the spec, but just for testing convenience)
function result<V>(...tuple: ErrorTupleResult | ValueTupleResult<V>) {
  return Object.assign(tuple, {
    ok: tuple[0],
    error: tuple[1],
    value: tuple[2],
  }) as Result<V>
}
