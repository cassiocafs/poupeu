jest.mock('./client', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from './client';
import {
  aceitarConvite,
  cancelarConvite,
  enviarConvite,
  listarConvitesRecebidos,
  recusarConvite,
  reenviarConvite,
  sairDoEspaco,
} from './espaco';

const mockApiFetch = apiFetch as jest.Mock;

describe('api/espaco', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(undefined);
  });

  it('envia o convite por POST com o e-mail no corpo', async () => {
    await enviarConvite('familiar@teste.com');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/espaco/convites', {
      method: 'POST',
      body: JSON.stringify({ email: 'familiar@teste.com' }),
    });
  });

  it('reenvia, cancela e sai do espaço nas rotas do espaço', async () => {
    await reenviarConvite('c1');
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/espaco/convites/c1/reenviar', { method: 'POST' });

    await cancelarConvite('c1');
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/espaco/convites/c1', { method: 'DELETE' });

    await sairDoEspaco();
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/espaco/sair', { method: 'POST' });
  });

  it('lista, aceita e recusa convites recebidos nas rotas de convites', async () => {
    await listarConvitesRecebidos();
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/convites/recebidos');

    await aceitarConvite('c2');
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/convites/c2/aceitar', { method: 'POST' });

    await recusarConvite('c2');
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/convites/c2/recusar', { method: 'POST' });
  });
});
