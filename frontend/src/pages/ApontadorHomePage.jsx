import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../services/auth";
import ApontadorHeader from "../components/ApontadorHeader";
import api from "../services/api";
import { markAsSynced, getPendingViagens, saveOfflineViagem, syncPendentes } from "../services/offlineViagens";
import { emitToast } from "../services/uiEvents";
import { mapVeiculoApi, storageKeyVeiculo } from "../utils/apontadorHome";
import {
  ApontadorHojeResumo,
  ApontadorRegistradoFlash,
  ApontadorTipoButtons,
  ApontadorVeiculoField,
} from "./apontador/ApontadorHomeSections";

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
      <ApontadorHeader online={online} textoPendentes={textoPendentes} onSyncManual={onSyncManual} />

      <ApontadorRegistradoFlash open={registradoFlash.open} visibleIn={registradoFlash.in} />

      <h1 className="sr-only">Apontador — registo de viagens</h1>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:pt-6 sm:pb-8">
        <div className="flex w-full max-w-md flex-col items-stretch justify-center space-y-6">
          <ApontadorVeiculoField
            loadingVeiculos={loadingVeiculos}
            veiculos={veiculos}
            veiculoId={veiculoId}
            onChangeVeiculo={(v) => {
              setVeiculoId(v);
              persistVeiculoId(v);
            }}
          />

          {!loadingVeiculos && veiculos.length === 0 && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-100">
              Nenhum veículo disponível para apontamento. O administrador deve cadastrar veículos de{" "}
              <strong className="text-amber-50">transporte (romaneio)</strong> com{" "}
              <strong className="text-amber-50">capacidade em toneladas</strong> (maior que zero) na gestão da empresa.
            </p>
          )}

          <ApontadorTipoButtons
            podeRegistrar={podeRegistrar}
            avisoInvalido={mostrarAvisoVeiculoInvalido}
            onEsteril={() => {
              void registrar("esteril");
            }}
            onRocha={() => {
              void registrar("rocha");
            }}
          />

          <ApontadorHojeResumo esteril={hojeContagem.esteril} rocha={hojeContagem.rocha} />
        </div>
      </main>
    </div>
  );
}
