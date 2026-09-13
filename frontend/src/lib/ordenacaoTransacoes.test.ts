import { describe, expect, it } from "vitest";
import { ordenarDias } from "./ordenacaoTransacoes";

describe("ordenarDias", () => {
  const dias = [
    { data: "2026-09-01", transacoes: ["a", "b"] },
    { data: "2026-09-02", transacoes: ["c"] },
  ];

  it("mantém a ordem cronológica crescente quando ordenacao é 'antigas'", () => {
    expect(ordenarDias(dias, "antigas")).toEqual(dias);
  });

  it("inverte dias e transações quando ordenacao é 'recentes' (padrão)", () => {
    expect(ordenarDias(dias, "recentes")).toEqual([
      { data: "2026-09-02", transacoes: ["c"] },
      { data: "2026-09-01", transacoes: ["b", "a"] },
    ]);
  });

  it("não muta o array original", () => {
    ordenarDias(dias, "recentes");
    expect(dias[0].data).toBe("2026-09-01");
    expect(dias[0].transacoes).toEqual(["a", "b"]);
  });
});
