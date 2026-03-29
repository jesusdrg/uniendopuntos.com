import { ApplicationError } from "@/investigations/application/errors/application-error";

export class NotFoundError extends ApplicationError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}
