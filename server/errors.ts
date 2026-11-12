import "server-only";
/** An error whose message is safe to show to the caller with the given HTTP status. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

export function invalid(message: string): HttpError {
  return new HttpError(400, message);
}
