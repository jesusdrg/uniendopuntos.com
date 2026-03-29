export class ApplicationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
