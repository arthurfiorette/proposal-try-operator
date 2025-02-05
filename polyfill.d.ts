// Impl note: Since its not possible to make iterators return different types based
// on the iteration state (yet) a union with a tuple is the only solution. Once its
// finished, this whole type branching can be removed into a single object union containing:
// { ok: boolean, error: unknown, value: V, [Symbol.iterator]: () => Iterator<(some syntax)> }
//
// See https://github.com/microsoft/TypeScript/issues/42033


/**
 * A try result can represent the result of either a failed or successful operation.
 * 
 * The result can be either destructured or accessed by index.
 * 
 * - `error` type should depend on `useUnknownInCatchVariables` tsconfig option
 * 
 */
type TryResult<V> = TryResultInner<true, undefined, V> | TryResultInner<false, unknown, undefined>;
type TryResultInner<O, E, V> = [O, E, V] & { ok: O, error: E, value: V }

interface TryResultConstructor {
  /**
   * Creates a result from a tuple
   *
   * @example
   *
   * new TryResult(true, undefined, 42)
   * new TryResult(false, new Error('Something went wrong'))
   */
  new<V>(...args: [boolean, unknown, V | undefined]): TryResult<V>;

  /**
   * Creates a result for a successful operation
   */
  ok<V>(value: V): TryResult<V>

  /**
   * Creates a result for a failed operation
   */
  error<V>(error: unknown): TryResult<V>
}

declare const TryResult: TryResultConstructor
