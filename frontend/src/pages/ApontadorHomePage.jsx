import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../services/auth";
import { inputClass } from "../components/FormField";
import api from "../services/api";
import { markAsSynced, getPendingViagens, saveOfflineViagem, syncPendentes } from "../services/offlineViagens";
import { emitToast } from "../services/uiEvents";

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

const storageKeyVeiculo = (empresaId) => `fc_apontador_veiculo_id:${empresaId ?? "default"}`;

export default function ApontadorHomePage() {
  const { user } = useAuth();
  const [veiculos, setVeiculos] = useState([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [hojeContagem, setHojeContagem] = useState({ esteril: 0, rocha: 0 });
  const [loadingVeiculos, setLoadingVeiculos] = useState(true);
  const [registradoFlash, setRegistradoFlash] = useState({ open: false, in: false });
  const [online, setOnline] = useState(navigator.onLine);
  const [pendentesCount, setPendentesCount] = useState(0);
  const flashTimeoutsRef = useRef([]);

  const clearFlashTimeouts = useCallback(() => {
    flashTimeoutsRef.current.forEach((id) => clearTimeout(id));
    flashTimeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearFlashTimeouts(), [clearFlashTimeouts]);

  const refreshPendentesCount = useCallback(async () => {
    try {
      const list = await getPendingViagens();
      setPendentesCount(list.length);
    } catch {
      setPendentesCount(0);
    }
  }, []);

  const onSyncManual = useCallback(async () => {
    await syncPendentes();
    await refreshPendentesCount();
    emitToast("Sincronizado com sucesso");
  }, [refreshPendentesCount]);

  useEffect(() => {
    void refreshPendentesCount();
    void syncPendentes().finally(() => {
      void refreshPendentesCount();
    });
  }, [refreshPendentesCount]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void syncPendentes().finally(() => {
        void refreshPendentesCount();
      });
    };
    const onOffline = () => {
      setOnline(false);
      void refreshPendentesCount();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshPendentesCount]);

  useEffect(() => {
    const id = setInterval(() => {
      void refreshPendentesCount();
    }, 10000);
    return () => clearInterval(id);
  }, [refreshPendentesCount]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshPendentesCount();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshPendentesCount]);

  const showRegistradoOk = useCallback(() => {
    clearFlashTimeouts();
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(50);
      }
    } catch {
      // ignorar ambientes sem vibração
    }
    setRegistradoFlash({ open: true, in: false });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setRegistradoFlash({ open: true, in: true }));
    });
    flashTimeoutsRef.current.push(
      setTimeout(() => setRegistradoFlash({ open: true, in: false }), 850),
      setTimeout(() => {
        setRegistradoFlash({ open: false, in: false });
        clearFlashTimeouts();
      }, 1000)
    );
  }, [clearFlashTimeouts]);

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

  useEffect(() => {
    let cancelled = false;
    const loadHoje = async () => {
      try {
        const { data } = await api.get("/apontador/viagens/contagem-hoje");
        const h = data?.hoje;
        if (cancelled) return;
        setHojeContagem({
          esteril: Number(h?.esteril) || 0,
          rocha: Number(h?.rocha) || 0,
        });
      } catch {
        // Mantém baseline 0; contagem local ainda sobe a cada registo bem-sucedido.
      }
    };
    void loadHoje();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistVeiculoId = useCallback(
    (id) => {
      const key = storageKeyVeiculo(user?.empresa_id);
      if (id) localStorage.setItem(key, String(id));
      else localStorage.removeItem(key);
    },
    [user?.empresa_id]
  );

  useEffect(() => {
    if (loadingVeiculos || veiculos.length === 0) return;
    const key = storageKeyVeiculo(user?.empresa_id);
    const saved = localStorage.getItem(key);
    if (saved && veiculos.some((v) => String(v.id) === String(saved))) {
      setVeiculoId(String(saved));
      return;
    }
    setVeiculoId((prev) => {
      if (prev && veiculos.some((v) => String(v.id) === String(prev))) return prev;
      const prefer = veiculos.find((v) => v.motorista?.id) ?? veiculos[0];
      return String(prefer.id);
    });
  }, [loadingVeiculos, veiculos, user?.empresa_id]);

  useEffect(() => {
    if (!veiculoId || veiculos.length === 0) return;
    if (!veiculos.some((v) => String(v.id) === String(veiculoId))) return;
    persistVeiculoId(veiculoId);
  }, [veiculoId, veiculos, persistVeiculoId]);

  const veiculoSelecionado = useMemo(
    () => veiculos.find((v) => String(v.id) === String(veiculoId)),
    [veiculos, veiculoId]
  );

  const registrar = useCallback(
    async (tipo) => {
      if (!veiculoSelecionado?.motorista?.id) return;
      const ts = Date.now();
      const chaveTipo = tipo === "esteril" ? "esteril" : "rocha";
      const viagem = {
        veiculo_id: veiculoSelecionado.id,
        motorista_id: veiculoSelecionado.motorista.id,
        tipo,
        timestamp: ts,
      };
      let id_local;
      try {
        const gravado = await saveOfflineViagem(viagem);
        id_local = gravado.id_local;
      } catch {
        emitToast("Não foi possível guardar o registo no dispositivo.", "error");
        return;
      }
      setHojeContagem((prev) => ({ ...prev, [chaveTipo]: prev[chaveTipo] + 1 }));
      showRegistradoOk();
      try {
        await api.post("/apontador/viagens", {
          veiculo_id: viagem.veiculo_id,
          motorista_id: viagem.motorista_id,
          tipo: viagem.tipo,
          timestamp: viagem.timestamp,
        });
        await markAsSynced(id_local);
      } catch {
        /* mantém pendente no IndexedDB; contador já atualizado */
      }
      void refreshPendentesCount();
    },
    [veiculoSelecionado, showRegistradoOk, refreshPendentesCount]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k !== "e" && k !== "r") return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!veiculoSelecionado?.motorista?.id) return;
      e.preventDefault();
      e.stopPropagation();
      if (k === "e") void registrar("esteril");
      else void registrar("rocha");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [registrar, veiculoSelecionado]);

  const podeRegistrar = Boolean(veiculoSelecionado?.motorista?.id);
  const mostrarAvisoVeiculoInvalido =
    !loadingVeiculos && veiculos.length > 0 && !podeRegistrar;

  const textoPendentes =
    pendentesCount === 0
      ? null
      : pendentesCount === 1
        ? "1 registro pendente"
        : `${pendentesCount} registros pendentes`;

  return (
    <div className="relative flex min-h-[100dvh] min-h-screen flex-col bg-slate-950 text-slate-100">
      <div className="fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex -translate-x-1/2 flex-col items-center gap-0.5">
        <p
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold shadow-lg shadow-black/30 ${
            online
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-100"
              : "border-amber-500/50 bg-amber-950/90 text-amber-100"
          }`}
          role="status"
          aria-live="polite"
        >
          {online ? "Online ✅" : "Offline ⚠️"}
        </p>
        {textoPendentes ? (
          <p
            className="max-w-[90vw] text-center text-[11px] font-medium leading-tight text-slate-500"
            role="status"
            aria-live="polite"
          >
            {textoPendentes}
          </p>
        ) : null}
      </div>

      {registradoFlash.open ? (
        <output
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-2xl border border-emerald-400/60 bg-emerald-950/95 px-8 py-3.5 text-xl font-bold text-emerald-50 shadow-2xl shadow-black/50 transition-all duration-200 ease-out motion-reduce:transition-none ${
            registradoFlash.in ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          Registrado ✅
        </output>
      ) : null}

      <h1 className="sr-only">Apontador — registo de viagens</h1>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pt-8 sm:pb-8">
        <div className="flex w-full max-w-md flex-col items-stretch justify-center space-y-6">
          <div>
            <label htmlFor="apontador-veiculo" className="mb-2 block text-center text-sm font-medium text-slate-400">
              Veículo
            </label>
            {loadingVeiculos ? (
              <div className={`${inputClass} flex h-14 items-center justify-center px-3 text-base text-slate-400`}>
                Carregando…
              </div>
            ) : (
              <select
                id="apontador-veiculo"
                className={`${inputClass} mx-auto block h-14 w-full max-w-sm text-base`}
                value={veiculoId}
                onChange={(e) => {
                  const v = e.target.value;
                  setVeiculoId(v);
                  persistVeiculoId(v);
                }}
                disabled={veiculos.length === 0}
              >
                <option value="">Selecionar</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.placa} — {v.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!loadingVeiculos && veiculos.length === 0 && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-100">
              Nenhum veículo cadastrado. Contacte o administrador.
            </p>
          )}

          <div className="flex w-full flex-col items-center gap-5 sm:gap-6">
            {mostrarAvisoVeiculoInvalido ? (
              <p
                className="w-full max-w-sm rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-base font-semibold text-amber-100"
                role="alert"
              >
                Selecione veículo válido
              </p>
            ) : null}
            <button
              type="button"
              disabled={!podeRegistrar}
              aria-disabled={!podeRegistrar}
              onClick={() => {
                void registrar("esteril");
              }}
              className="fc-btn flex w-full min-h-[88px] max-w-sm items-center justify-center rounded-2xl border-2 border-blue-500/70 bg-blue-600/35 px-4 py-5 text-2xl font-extrabold tracking-wide text-white shadow-xl shadow-blue-950/50 transition enabled:hover:border-sky-400 enabled:hover:bg-blue-500/45 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[96px] sm:text-3xl"
            >
              [ + ESTÉRIL ]
            </button>
            <button
              type="button"
              disabled={!podeRegistrar}
              aria-disabled={!podeRegistrar}
              onClick={() => {
                void registrar("rocha");
              }}
              className="fc-btn flex w-full min-h-[88px] max-w-sm items-center justify-center rounded-2xl border-2 border-orange-500/70 bg-gradient-to-b from-orange-600/40 to-red-700/35 px-4 py-5 text-2xl font-extrabold tracking-wide text-orange-50 shadow-xl shadow-orange-950/40 transition enabled:hover:border-orange-400 enabled:hover:from-orange-500/50 enabled:hover:to-red-600/40 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[96px] sm:text-3xl"
            >
              [ + ROCHA ]
            </button>
          </div>

          <section
            className="mx-auto w-full max-w-sm rounded-2xl border border-slate-700/90 bg-slate-900/80 px-4 py-5 shadow-inner shadow-black/20"
            aria-label="Produção de hoje"
          >
            <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Hoje</p>
            <div
              className="mt-3 grid grid-cols-2 gap-4"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Estéril</p>
                <p className="mt-1 text-5xl font-black tabular-nums leading-none text-cyan-300 sm:text-6xl">
                  {hojeContagem.esteril}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rocha</p>
                <p className="mt-1 text-5xl font-black tabular-nums leading-none text-amber-300 sm:text-6xl">
                  {hojeContagem.rocha}
                </p>
              </div>
            </div>
          </section>

          <button
            type="button"
            onClick={() => {
              void onSyncManual();
            }}
            className="mx-auto w-full max-w-sm rounded-xl border border-slate-600/70 bg-slate-900/40 py-3 text-sm font-medium text-slate-300 shadow-sm transition hover:border-slate-500 hover:bg-slate-800/50 active:scale-[0.99]"
          >
            Sincronizar agora
          </button>
        </div>
      </main>
    </div>
  );
}
