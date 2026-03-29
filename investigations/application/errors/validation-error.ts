import { ApplicationError } from "@/investigations/application/errors/application-error";

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}
