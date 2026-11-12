import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvitesRecebidosBanner } from "./ConvitesRecebidosBanner";

vi.mock("@/api/espaco", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/espaco")>();
  return {
    ...original,
    listarConvitesRecebidos: vi.fn(),
    aceitarConvite: vi.fn(),
    recusarConvite: vi.fn(),
  };
});

const api = await import("@/api/espaco");

const CONVITE = {
  id: "c1",
  convidadoPor: "Esteyce",
  criadoEm: new Date().toISOString(),
  expiraEm: new Date(Date.now() + 86_400_000).toISOString(),
};

function renderizar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const resetQueries = vi.spyOn(queryClient, "resetQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <ConvitesRecebidosBanner />
    </QueryClientProvider>,
  );
  return { resetQueries };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ConvitesRecebidosBanner", () => {
  it("não renderiza nada sem convites", async () => {
    vi.mocked(api.listarConvitesRecebidos).mockResolvedValue([]);

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ConvitesRecebidosBanner />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(api.listarConvitesRecebidos).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("aceitar exige confirmação e depois descarta o cache do espaço anterior", async () => {
    vi.mocked(api.listarConvitesRecebidos).mockResolvedValue([CONVITE]);
    vi.mocked(api.aceitarConvite).mockResolvedValue({ espaco: { id: "e2", nome: "Casa" } });

    const { resetQueries } = renderizar();
    expect(await screen.findByText("Esteyce")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(api.aceitarConvite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Entrar no espaço" }));
    await waitFor(() => expect(api.aceitarConvite).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(resetQueries).toHaveBeenCalled());
  });

  it("recusar chama a API sem pedir confirmação", async () => {
    vi.mocked(api.listarConvitesRecebidos).mockResolvedValue([CONVITE]);
    vi.mocked(api.recusarConvite).mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(await screen.findByRole("button", { name: "Recusar" }));

    await waitFor(() => expect(api.recusarConvite).toHaveBeenCalledWith("c1"));
    expect(api.aceitarConvite).not.toHaveBeenCalled();
  });
});
