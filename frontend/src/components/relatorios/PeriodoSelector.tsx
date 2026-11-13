import type { PeriodoMes } from "@/api/transacoes";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { MesNavigator } from "@/components/shared/MesNavigator";
import { contarMeses, hojePeriodo, ordinalMes, subtrairMeses } from "@/lib/periodo";

interface PeriodoSelectorProps {
  inicio: PeriodoMes;
  fim: PeriodoMes;
  onChange: (inicio: PeriodoMes, fim: PeriodoMes) => void;
}

const PRESETS: { rotulo: string; intervalo: () => { inicio: PeriodoMes; fim: PeriodoMes } }[] = [
  { rotulo: "Mês atual", intervalo: () => ({ inicio: hojePeriodo(), fim: hojePeriodo() }) },
  { rotulo: "3 meses", intervalo: () => ({ inicio: subtrairMeses(hojePeriodo(), 2), fim: hojePeriodo() }) },
  { rotulo: "6 meses", intervalo: () => ({ inicio: subtrairMeses(hojePeriodo(), 5), fim: hojePeriodo() }) },
  { rotulo: "12 meses", intervalo: () => ({ inicio: subtrairMeses(hojePeriodo(), 11), fim: hojePeriodo() }) },
  {
    rotulo: "Ano atual",
    intervalo: () => {
      const h = hojePeriodo();
      return { inicio: { ano: h.ano, mes: 1 }, fim: h };
    },
  },
];

function mesmoIntervalo(a: PeriodoMes, b: PeriodoMes): boolean {
  return a.ano === b.ano && a.mes === b.mes;
}

export function PeriodoSelector({ inicio, fim, onChange }: PeriodoSelectorProps) {
  const totalMeses = contarMeses(inicio, fim);
  const foraDeOrdem = ordinalMes(inicio) > ordinalMes(fim);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MesNavigator
            ano={inicio.ano}
            mes={inicio.mes}
            onChange={(ano, mes) => onChange({ ano, mes }, fim)}
          />
          <span className="text-xs text-muted-foreground">até</span>
          <MesNavigator
            ano={fim.ano}
            mes={fim.mes}
            onChange={(ano, mes) => onChange(inicio, { ano, mes })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => {
            const alvo = preset.intervalo();
            const ativo =
              mesmoIntervalo(alvo.inicio, inicio) && mesmoIntervalo(alvo.fim, fim);
            return (
              <Chip
                key={preset.rotulo}
                selected={ativo}
                onClick={() => onChange(alvo.inicio, alvo.fim)}
              >
                {preset.rotulo}
              </Chip>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {foraDeOrdem
          ? "O mês inicial precisa ser anterior ou igual ao final."
          : totalMeses > 24
            ? "O período máximo é de 24 meses. Ajuste as datas."
            : `${totalMeses} ${totalMeses === 1 ? "mês" : "meses"} no período`}
      </p>
    </Card>
  );
}
