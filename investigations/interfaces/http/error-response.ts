import { ApplicationError } from "@/investigations/application/errors/application-error";

type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApplicationError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      } satisfies ErrorBody,
      { status: error.statusCode },
    );
  }

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      route: "investigations.http.error-response",
      methodEvent: "exception",
      statusResult: "500",
      durationMs: 0,
      errorCode: "INTERNAL_ERROR",
    }),
  );

  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Ocurrio un error interno.",
      },
    } satisfies ErrorBody,
    { status: 500 },
  );
}
