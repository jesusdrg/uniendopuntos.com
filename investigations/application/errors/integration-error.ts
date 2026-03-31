import { ApplicationError } from "@/investigations/application/errors/application-error";

export const INTEGRATION_ERROR_CATEGORIES = [
  "auth",
  "rate-limit",
  "timeout",
  "upstream-failure",
  "config-missing",
] as const;

export type IntegrationErrorCategory = (typeof INTEGRATION_ERROR_CATEGORIES)[number];

type IntegrationErrorDefinition = {
  code: string;
  statusCode: number;
};

const INTEGRATION_ERROR_DEFINITIONS: Record<IntegrationErrorCategory, IntegrationErrorDefinition> = {
  auth: {
    code: "INTEGRATION_AUTH",
    statusCode: 401,
  },
  "rate-limit": {
    code: "INTEGRATION_RATE_LIMIT",
    statusCode: 429,
  },
  timeout: {
    code: "INTEGRATION_TIMEOUT",
    statusCode: 504,
  },
  "upstream-failure": {
    code: "INTEGRATION_UPSTREAM_FAILURE",
    statusCode: 502,
  },
  "config-missing": {
    code: "INTEGRATION_CONFIG_MISSING",
    statusCode: 503,
  },
};

export class IntegrationError extends ApplicationError {
  public readonly category: IntegrationErrorCategory;

  constructor(category: IntegrationErrorCategory, message: string) {
    const definition = INTEGRATION_ERROR_DEFINITIONS[category];
    super(message, definition.code, definition.statusCode);
    this.name = "IntegrationError";
    this.category = category;
  }
}
