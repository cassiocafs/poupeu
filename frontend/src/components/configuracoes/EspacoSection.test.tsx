import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EspacoDetalhe } from "@/api/espaco";
import { EspacoSection } from "./EspacoSection";

vi.mock("@/api/espaco", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/espaco")>();
  return {
    ...original,
    obterEspaco: vi.fn(),
    enviarConvite: vi.fn(),
    reenviarConvite: vi.fn(),
    cancelarConvite: vi.fn(),
    sairDoEspaco: vi.fn(),
  };
});

const api = await import("@/api/espaco");

const EM_UM_DIA = new Date(Date.now() + 86_400_000).toISOString();

function espaco(over: Partial<EspacoDetalhe> = {}): EspacoDetalhe {
  return {
    espaco: { id: "e1", nome: "Casa" },
    membros: [{ id: "u1", nome: "Cássio", email: "cassio@teste.com", voceMesmo: true }],
    convites: [],
    ...over,
  };
}

function renderizar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EspacoSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("EspacoSection", () => {
  it("lista os membros marcando quem é você", async () => {
    vi.mocked(api.obterEspaco).mockResolvedValue(
      espaco({
        membros: [
          { id: "u1", nome: "Cássio", email: "cassio@teste.com", voceMesmo: true },
          { id: "u2", nome: null, email: "esposa@teste.com", voceMesmo: false },
        ],
      }),
    );

    renderizar();

    expect(await screen.findByText("Membros (2)")).toBeInTheDocument();
    expect(screen.getByText("Você")).toBeInTheDocument();
    expect(screen.getByText("esposa@teste.com")).toBeInTheDocument();
  });

  it("envia o convite com o e-mail digitado e confirma o envio", async () => {
    vi.mocked(api.obterEspaco).mockResolvedValue(espaco());
    vi.mocked(api.enviarConvite).mockResolvedValue({
      convite: {
        id: "c1",
        emailConvidado: "filho@teste.com",
        criadoEm: new Date().toISOString(),
        expiraEm: EM_UM_DIA,
        expirado: false,
      },
      emailEnviado: true,
    });

    renderizar();
    await screen.findByText("Membros (1)");
    fireEvent.change(screen.getByLabelText("E-mail do familiar"), {
      target: { value: "filho@teste.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(await screen.findByText("Convite enviado para filho@teste.com.")).toBeInTheDocument();
    expect(api.enviarConvite).toHaveBeenCalledWith("filho@teste.com");
    expect(screen.getByLabelText("E-mail do familiar")).toHaveValue("");
  });

  it("avisa quando o convite foi criado mas o e-mail não saiu", async () => {
    vi.mocked(api.obterEspaco).mockResolvedValue(espaco());
    vi.mocked(api.enviarConvite).mockResolvedValue({
      convite: {
        id: "c1",
        emailConvidado: "filho@teste.com",
        criadoEm: new Date().toISOString(),
        expiraEm: EM_UM_DIA,
        expirado: false,
      },
      emailEnviado: false,
    });

    renderizar();
    await screen.findByText("Membros (1)");
    fireEvent.change(screen.getByLabelText("E-mail do familiar"), {
      target: { value: "filho@teste.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(await screen.findByText(/não conseguimos enviar o e-mail/)).toBeInTheDocument();
  });

  it("mostra o erro do servidor (ex.: convite duplicado)", async () => {
    vi.mocked(api.obterEspaco).mockResolvedValue(espaco());
    vi.mocked(api.enviarConvite).mockRejectedValue(
      new Error("Já existe um convite pendente para esse e-mail."),
    );

    renderizar();
    await screen.findByText("Membros (1)");
    fireEvent.change(screen.getByLabelText("E-mail do familiar"), {
      target: { value: "filho@teste.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe um convite pendente");
  });

  it("lista convites pendentes e permite cancelar e reenviar", async () => {
    vi.mocked(api.obterEspaco).mockResolvedValue(
      espaco({
        convites: [
          {
            id: "c1",
            emailConvidado: "filho@teste.com",
            criadoEm: new Date().toISOString(),
            expiraEm: new Date(Date.now() - 1000).toISOString(),
            expirado: true,
          },
        ],
      }),
    );
    vi.mocked(api.cancelarConvite).mockResolvedValue(undefined);
    vi.mocked(api.reenviarConvite).mockResolvedValue({
      convite: {
        id: "c1",
        emailConvidado: "filho@teste.com",
        criadoEm: new Date().toISOString(),
        expiraEm: EM_UM_DIA,
        expirado: false,
      },
      emailEnviado: true,
    });

    renderizar();

    expect(await screen.findByText("Expirado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    await waitFor(() => expect(api.reenviarConvite).toHaveBeenCalledWith("c1"));

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(api.cancelarConvite).toHaveBeenCalledWith("c1"));
  });

  it("só oferece sair do espaço quando há outros membros", async () => {
    vi.mocked(api.obterEspaco).mockResolvedValue(espaco());

    renderizar();
    await screen.findByText("Membros (1)");

    expect(screen.queryByRole("button", { name: /Sair do espaço/ })).not.toBeInTheDocument();
  });

  it("sair do espaço pede confirmação antes de chamar a API", async () => {
    vi.mocked(api.obterEspaco).mockResolvedValue(
      espaco({
        membros: [
          { id: "u1", nome: "Cássio", email: "cassio@teste.com", voceMesmo: true },
          { id: "u2", nome: "Esposa", email: "esposa@teste.com", voceMesmo: false },
        ],
      }),
    );
    vi.mocked(api.sairDoEspaco).mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(await screen.findByRole("button", { name: "Sair do espaço compartilhado" }));
    expect(api.sairDoEspaco).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sair do espaço" }));
    await waitFor(() => expect(api.sairDoEspaco).toHaveBeenCalledTimes(1));
  });
});
