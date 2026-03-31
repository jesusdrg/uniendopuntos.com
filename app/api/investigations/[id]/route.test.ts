import { describe, expect, it } from "bun:test";

import { DELETE } from "@/app/api/investigations/[id]/route";
import { createInvestigationUseCase } from "@/investigations/interfaces/http/dependencies";

describe("DELETE /api/investigations/[id]", () => {
  it("returns 204 when delete succeeds", async () => {
    const created = await createInvestigationUseCase.execute({ query: "flujo delete" });

    const response = await DELETE(
      new Request(`http://localhost/api/investigations/${created.id}`, {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ id: created.id }),
      },
    );

    expect(response.status).toBe(204);
  });

  it("returns 404 when investigation does not exist", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/investigations/missing-id", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ id: "missing-id" }),
      },
    );

    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("NOT_FOUND");
  });
});
