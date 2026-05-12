import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../services/auth";
import { inputClass } from "../components/FormField";
import api from "../services/api";
import { emitToast } from "../services/uiEvents";

const tipoLabel = (tipo) => (tipo === "esteril" ? "Estéril" : "Rocha");

const mapVeiculoApi = (v) => ({
  id: v.id,
  placa: v.placa,
  nome: v.nome,
  capacidadeTon:
    v.capacidade_ton != null && v.capacidade_ton !== "" ? Number(v.capacidade_ton) : null,
  motorista:
    v.motorista_id != null
      ? { id: v.motorista_id, nome: String(v.motorista_nome || "").trim() || "Motorista" }
      : null,
});

export default function ApontadorHomePage() {
  const { user } = useAuth();
  const [veiculos, setVeiculos] = useState([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [registros, setRegistros] = useState([]);
  const [loadingVeiculos, setLoadingVeiculos] = useState(true);
  const [inFlight, setInFlight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingVeiculos(true);
      try {
        const { data } = await api.get("/apontador/veiculos", { params: { limit: 200, page: 1 } });
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!cancelled) {
          setVeiculos(items.map(mapVeiculoApi));
        }
      } catch (err) {
        if (!cancelled) {
          setVeiculos([]);
          emitToast(err?.response?.data?.message || "Não foi possível carregar os veículos.", "error");
        }
      } finally {
        if (!cancelled) setLoadingVeiculos(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const veiculoSelecionado = useMemo(
    () => veiculos.find((v) => String(v.id) === String(veiculoId)),
    [veiculos, veiculoId]
  );

  const placaPorId = useCallback(
    (id) => veiculos.find((v) => String(v.id) === String(id))?.placa ?? "—",
    [veiculos]
  );

  const registrar = useCallback(
    async (tipo) => {
      if (!veiculoSelecionado) return;
      if (!veiculoSelecionado.motorista?.id) {
        emitToast("Este veículo não tem motorista vinculado. Vincule um motorista na gestão da empresa.", "warning");
        return;
      }
      const ts = Date.now();
      setInFlight((n) => n + 1);
      try {
        const { data } = await api.post("/apontador/viagens", {
          veiculo_id: veiculoSelecionado.id,
          motorista_id: veiculoSelecionado.motorista.id,
          tipo,
          timestamp: ts,
        });
        const v = data?.viagem;
        const item = {
          id: v?.id,
          veiculo_id: v?.veiculo_id ?? veiculoSelecionado.id,
          motorista_id: v?.motorista_id ?? veiculoSelecionado.motorista.id,
          tipo: v?.tipo ?? tipo,
          timestamp: typeof v?.timestamp === "number" ? v.timestamp : ts,
        };
        setRegistros((prev) => [item, ...prev]);
      } catch (err) {
        emitToast(err?.response?.data?.message || "Não foi possível salvar a viagem.", "error");
      } finally {
        setInFlight((n) => Math.max(0, n - 1));
      }
    },
    [veiculoSelecionado]
  );

  const registrosOrdenados = useMemo(
    () => [...registros].sort((a, b) => b.timestamp - a.timestamp),
    [registros]
  );

  const podeRegistrar = Boolean(veiculoSelecionado?.motorista?.id);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-950 px-4 pb-10 pt-6 text-slate-100">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/90">Romaneio digital</p>
        <h1 className="mt-1 text-xl font-bold text-white">Apontador</h1>
        <p className="mt-1 truncate text-sm text-slate-400">
          {user?.empresa_nome || "Operação"} · {user?.nome}
        </p>
      </header>

      <section className="space-y-5" aria-label="Seleção e registro de viagem">
        <div>
          <label htmlFor="apontador-veiculo" className="mb-2 block text-sm font-medium text-slate-300">
            Selecionar veículo
          </label>
          {loadingVeiculos ? (
            <div className={`${inputClass} flex h-14 items-center px-3 text-base text-slate-400`}>
              Carregando veículos…
            </div>
          ) : (
            <select
              id="apontador-veiculo"
              className={`${inputClass} h-14 w-full text-base`}
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              disabled={veiculos.length === 0}
            >
              <option value="">Selecionar veículo</option>
              {veiculos.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {v.placa} — {v.nome}
                </option>
              ))}
            </select>
          )}
        </div>

        {!loadingVeiculos && veiculos.length === 0 && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Nenhum veículo cadastrado para esta empresa. Peça ao administrador para cadastrar veículos e motoristas.
          </p>
        )}

        {veiculoSelecionado ? (
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 px-4 py-4 shadow-inner shadow-black/20">
            <p className="text-sm text-slate-400">
              Motorista:{" "}
              <span className="font-semibold text-white">
                {veiculoSelecionado.motorista?.nome ?? "— (não vinculado)"}
              </span>
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Capacidade:{" "}
              <span className="font-semibold text-white">
                {veiculoSelecionado.capacidadeTon != null ? `${veiculoSelecionado.capacidadeTon} ton` : "—"}
              </span>
            </p>
          </div>
        ) : (
          !loadingVeiculos &&
          veiculos.length > 0 && (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-3 text-center text-sm text-slate-500">
              Escolha um veículo para ver motorista e capacidade.
            </p>
          )
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!veiculoSelecionado || !podeRegistrar}
            onClick={() => {
              void registrar("esteril");
            }}
            className="fc-btn min-h-[3.5rem] rounded-2xl border-2 border-cyan-500/50 bg-cyan-600/25 px-4 py-4 text-lg font-bold text-cyan-50 shadow-lg shadow-cyan-950/30 transition enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Estéril
          </button>
          <button
            type="button"
            disabled={!veiculoSelecionado || !podeRegistrar}
            onClick={() => {
              void registrar("rocha");
            }}
            className="fc-btn min-h-[3.5rem] rounded-2xl border-2 border-amber-500/50 bg-amber-600/25 px-4 py-4 text-lg font-bold text-amber-50 shadow-lg shadow-amber-950/30 transition enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Rocha
          </button>
        </div>
        {inFlight > 0 && (
          <p className="text-center text-xs font-medium text-cyan-200/90" role="status" aria-live="polite">
            A registar…
          </p>
        )}
      </section>

      <section className="mt-8" aria-label="Últimos registros">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Últimos registros</h2>
        {registrosOrdenados.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-500">
            Nenhum registro ainda. Toque em Estéril ou Rocha após selecionar o veículo com motorista vinculado.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/50">
            {registrosOrdenados.map((r, idx) => (
              <li
                key={r.id != null ? `v-${r.id}` : `t-${r.timestamp}-${idx}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 text-base"
              >
                <span className="shrink-0 font-mono text-slate-300">
                  {new Date(r.timestamp).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-center font-semibold text-white">
                  {placaPorId(r.veiculo_id)}
                </span>
                <span
                  className={`shrink-0 font-medium ${
                    r.tipo === "esteril" ? "text-cyan-300" : "text-amber-300"
                  }`}
                >
                  {tipoLabel(r.tipo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
