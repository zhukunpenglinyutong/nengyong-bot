// Electron prefixes IPC errors with "Error invoking remote method …"; keep only our message
export const ipcErrorMessage = (error: unknown) =>
  String(error instanceof Error ? error.message : error).replace(/^.*Error: /s, '')

/** What a bridge call came back with: its value, or why it failed, in words for the user. */
export type Loaded<T> = { kind: 'loaded'; value: T } | { kind: 'failed'; message: string }

/** A bridge call that never rejects, for a page that reads it with `use()` under Suspense. */
export const settle = <T>(promise: Promise<T>): Promise<Loaded<T>> =>
  promise.then(
    (value): Loaded<T> => ({ kind: 'loaded', value }),
    (error): Loaded<T> => ({ kind: 'failed', message: ipcErrorMessage(error) }),
  )
