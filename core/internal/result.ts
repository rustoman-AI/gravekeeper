export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type SerializeError =
  | { readonly kind: 'unsupported-format'; readonly format: string }
  | { readonly kind: 'invalid-input'; readonly message: string }
  | { readonly kind: 'too-many-dependencies'; readonly limit: number }
  | { readonly kind: 'internal-error'; readonly message: string };
