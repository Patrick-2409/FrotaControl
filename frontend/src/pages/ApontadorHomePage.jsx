import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../services/auth";
import ApontadorHeader from "../components/ApontadorHeader";
import api from "../services/api";
import { markAsSynced, getPendingViagens, saveOfflineViagem, syncPendentes, deleteViagemLocal, clearLocalViagensForSpTodayMatchingVehicles } from "../services/offlineViagens";
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
  const [hojeContagem, setHojeContagem] = useState({ esteril: 0, rocha: 0, tonTotal: 0 });
  const [loadingVeiculos, setLoadingVeiculos] = useState(true);
  const [registradoFlash, setRegistradoFlash] = useState({ open: false, in: false, label: "" });
  const [online, setOnline] = useState(navigator.onLine);
  const [pendentesCount, setPendentesCount] = useState(0);
  const [limparDiaModalOpen, setLimparDiaModalOpen] = useState(false);
  const [limparDiaEmCurso, setLimparDiaEmCurso] = useState(false);
  const [ultimosLancamentos, setUltimosLancamentos] = useState([]);
  const [desfazendoLancamentoId, setDesfazendoLancamentoId] = useState(null);
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

  const formatHoraBr = useCallback((timestamp) => {
    const parsed = new Date(Number(timestamp));
    if (Number.isNaN(parsed.getTime())) return "--:--";
    return parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, []);

  const normalizeLancamentos = useCallback(
    (items) =>
      (Array.isArray(items) ? items : [])
        .map((item, index) => {
          const tipo = item?.tipo === "esteril" ? "esteril" : item?.tipo === "rocha" ? "rocha" : null;
          const timestamp = Number(item?.timestamp);
          if (!tipo || !Number.isFinite(timestamp)) return null;
          const viagemId = Number(item?.viagem_id ?? item?.id);
          const veiculoId = Number(item?.veiculo_id);
          const motoristaId = Number(item?.motorista_id);
          return {
            id: item?.id ?? `local-${timestamp}-${tipo}-${index}`,
            viagem_id: Number.isFinite(viagemId) && viagemId > 0 ? viagemId : null,
            veiculo_id: Number.isFinite(veiculoId) && veiculoId > 0 ? veiculoId : null,
            motorista_id: Number.isFinite(motoristaId) && motoristaId > 0 ? motoristaId : null,
            local_id: item?.local_id || null,
            tonDelta: Number(item?.tonDelta) > 0 ? Number(item.tonDelta) : 0,
            tipo,
            timestamp,
            hora: formatHoraBr(timestamp),
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5),
    [formatHoraBr]
  );

  const pushLancamentoLocal = useCallback(
    ({ tipo, timestamp, localId, veiculo_id, motorista_id, tonDelta }) => {
      const next = {
        id: localId || `local-${timestamp}-${tipo}`,
        viagem_id: null,
        veiculo_id: Number(veiculo_id) || null,
        motorista_id: Number(motorista_id) || null,
        local_id: localId || null,
        tonDelta: Number(tonDelta) > 0 ? Number(tonDelta) : 0,
        tipo,
        timestamp,
        hora: formatHoraBr(timestamp),
      };
      setUltimosLancamentos((prev) => {
        const merged = [next, ...prev];
        const seen = new Set();
        return merged
          .filter((item) => {
            const key = `${item.tipo}:${item.timestamp}:${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5);
      });
    },
    [formatHoraBr]
  );

  const refreshContagemHoje = useCallback(async () => {
    try {
      const { data } = await api.get("/apontador/viagens/contagem-hoje");
      const h = data?.hoje;
      const ton =
        h?.ton_total != null
          ? Number(h.ton_total)
          : (Number(h?.ton_esteril) || 0) + (Number(h?.ton_rocha) || 0);
      setHojeContagem({
        esteril: Number(h?.esteril) || 0,
        rocha: Number(h?.rocha) || 0,
        tonTotal: Number.isFinite(ton) ? ton : 0,
      });
      setUltimosLancamentos(normalizeLancamentos(data?.ultimos_lancamentos));
    } catch {
      /* mantém valores atuais */
    }
  }, [normalizeLancamentos]);

  const onSyncManual = useCallback(async () => {
    if (!online) {
      emitToast("Sem internet no momento. Os registros serão sincronizados automaticamente quando voltar.", "warning");
      return;
    }
    await syncPendentes();
    await refreshPendentesCount();
    await refreshContagemHoje();
    emitToast("Sincronização concluída.", "success");
  }, [online, refreshPendentesCount, refreshContagemHoje]);

  useEffect(() => {
    void refreshPendentesCount();
    void syncPendentes().finally(() => {
      void refreshPendentesCount();
      void refreshContagemHoje();
    });
  }, [refreshPendentesCount, refreshContagemHoje]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void syncPendentes().finally(() => {
        void refreshPendentesCount();
        void refreshContagemHoje();
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
  }, [refreshPendentesCount, refreshContagemHoje]);

  useEffect(() => {
    const id = setInterval(() => {
      void refreshPendentesCount();
      void refreshContagemHoje();
    }, 3000);
    return () => clearInterval(id);
  }, [refreshPendentesCount, refreshContagemHoje]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshPendentesCount();
        void refreshContagemHoje();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshPendentesCount, refreshContagemHoje]);

  useEffect(() => {
    const onFocus = () => {
      void refreshContagemHoje();
      void refreshPendentesCount();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshContagemHoje, refreshPendentesCount]);

  const showRegistradoOk = useCallback((tipo) => {
    clearFlashTimeouts();
    const label = tipo === "esteril" ? "+1 Estéril ✔" : "+1 Rocha ✔";
    setRegistradoFlash({ open: true, in: false, label });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setRegistradoFlash((prev) => ({ ...prev, open: true, in: true })));
    });
    flashTimeoutsRef.current.push(
      setTimeout(() => setRegistradoFlash((prev) => ({ ...prev, open: true, in: false })), 850),
      setTimeout(() => {
        setRegistradoFlash({ open: false, in: false, label: "" });
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
    void refreshContagemHoje();
  }, [refreshContagemHoje]);

  const persistVeiculoId = useCallback(
    (id) => {
      const key = storageKeyVeiculo(user?.empresa_id, user?.id);
      if (id) localStorage.setItem(key, String(id));
      else localStorage.removeItem(key);
    },
    [user?.empresa_id, user?.id]
  );

  useEffect(() => {
    if (loadingVeiculos || veiculos.length === 0) return;
    const key = storageKeyVeiculo(user?.empresa_id, user?.id);
    const legacyKey = storageKeyVeiculo(user?.empresa_id);
    const saved = localStorage.getItem(key);
    const legacySaved = saved ? null : localStorage.getItem(legacyKey);
    const resolvedSaved = saved || legacySaved;
    const savedOption = resolvedSaved
      ? veiculos.find((v) => String(v.opcaoId) === String(resolvedSaved)) ||
        veiculos.find((v) => String(v.id) === String(resolvedSaved))
      : null;
    if (savedOption) {
      if (legacySaved) {
        localStorage.setItem(key, String(savedOption.opcaoId));
        localStorage.removeItem(legacyKey);
      }
      setVeiculoId(String(savedOption.opcaoId));
      return;
    }
    setVeiculoId((prev) => {
      if (prev && veiculos.some((v) => String(v.opcaoId) === String(prev))) return prev;
      const prefer = veiculos.find((v) => v.motorista?.id) ?? veiculos[0];
      return String(prefer.opcaoId);
    });
  }, [loadingVeiculos, veiculos, user?.empresa_id, user?.id]);

  useEffect(() => {
    if (!veiculoId || veiculos.length === 0) return;
    if (!veiculos.some((v) => String(v.opcaoId) === String(veiculoId))) return;
    persistVeiculoId(veiculoId);
  }, [veiculoId, veiculos, persistVeiculoId]);

  const veiculoSelecionado = useMemo(
    () => veiculos.find((v) => String(v.opcaoId) === String(veiculoId)),
    [veiculos, veiculoId]
  );
  const capacidadeEsterilTon = Number(veiculoSelecionado?.capacidadePorMaterial?.esteril) || 0;
  const capacidadeRochaTon = Number(veiculoSelecionado?.capacidadePorMaterial?.rocha) || 0;
  const temMotoristaVinculado = Boolean(veiculoSelecionado?.motorista?.id);
  const temMaterialConfigurado = capacidadeEsterilTon > 0 || capacidadeRochaTon > 0;

  const idsVeiculosEmpresa = useMemo(
    () => [...new Set(veiculos.map((v) => Number(v.id)).filter((n) => Number.isFinite(n) && n > 0))],
    [veiculos]
  );

  const executarLimparDia = useCallback(async () => {
    setLimparDiaEmCurso(true);
    try {
      const loc = await clearLocalViagensForSpTodayMatchingVehicles(idsVeiculosEmpresa);
      let avisoServidor = null;
      try {
        await api.post("/apontador/viagens/reset-dia", {});
      } catch (err) {
        avisoServidor = err?.response?.data?.message || "Não foi possível limpar no servidor.";
      }
      await refreshContagemHoje();
      void refreshPendentesCount();
      setLimparDiaModalOpen(false);
      if (avisoServidor) {
        emitToast(avisoServidor, "warning");
      } else {
        emitToast(loc > 0 ? `Dia reiniciado (${loc} registro(s) local).` : "Dia reiniciado.", "success");
      }
    } catch {
      emitToast("Não foi possível limpar os dados locais.", "error");
    } finally {
      setLimparDiaEmCurso(false);
    }
  }, [idsVeiculosEmpresa, refreshContagemHoje, refreshPendentesCount]);

  const removerViagemNoServidor = useCallback(async (ctx) => {
    const payload = ctx.serverViagemId
      ? { viagem_id: ctx.serverViagemId }
      : {
          veiculo_id: ctx.viagem.veiculo_id,
          motorista_id: ctx.viagem.motorista_id,
          tipo: ctx.viagem.tipo,
          timestamp: ctx.viagem.timestamp,
        };
    try {
      await api.delete("/apontador/viagens", { data: payload, skipGlobalErrorToast: true });
    } catch {
      /* offline ou já removido */
    }
  }, []);

  const desfazerLancamento = useCallback(
    async (item) => {
      if (!item) return;
      const uiId = String(item.id);
      const viagemId = Number(item.viagem_id ?? item.id);
      const temViagemServidor = Number.isFinite(viagemId) && viagemId > 0;
      const exigeServidor =
        temViagemServidor ||
        (!item.local_id && Number(item.veiculo_id) > 0 && Number(item.motorista_id) > 0 && item.tipo && item.timestamp);

      if (exigeServidor && !navigator.onLine) {
        emitToast("Para desfazer um lanÃ§amento sincronizado, conecte-se Ã  internet.", "warning");
        return;
      }

      setDesfazendoLancamentoId(uiId);
      try {
        if (temViagemServidor) {
          await api.delete("/apontador/viagens", {
            data: { viagem_id: viagemId },
            skipGlobalErrorToast: true,
          });
        } else if (exigeServidor) {
          await api.delete("/apontador/viagens", {
            data: {
              veiculo_id: item.veiculo_id,
              motorista_id: item.motorista_id,
              tipo: item.tipo,
              timestamp: item.timestamp,
            },
            skipGlobalErrorToast: true,
          });
        }

        if (item.local_id) {
          await deleteViagemLocal(item.local_id).catch(() => {});
        }

        setUltimosLancamentos((prev) => prev.filter((row) => String(row.id) !== uiId));
        if (!temViagemServidor && item.local_id) {
          const chaveTipo = item.tipo === "esteril" ? "esteril" : "rocha";
          const tonDelta = Number(item.tonDelta) || 0;
          setHojeContagem((prev) => ({
            ...prev,
            [chaveTipo]: Math.max(0, Number(prev[chaveTipo] || 0) - 1),
            tonTotal: Math.max(0, (Number(prev.tonTotal) || 0) - tonDelta),
          }));
        }
        await refreshPendentesCount();
        await refreshContagemHoje();
        emitToast("LanÃ§amento desfeito.", "success");
      } catch (err) {
        emitToast(err?.response?.data?.message || "NÃ£o foi possÃ­vel desfazer este lanÃ§amento.", "error");
        await refreshContagemHoje();
      } finally {
        setDesfazendoLancamentoId(null);
      }
    },
    [refreshContagemHoje, refreshPendentesCount]
  );

  const registrar = useCallback(
    async (tipo) => {
      if (!veiculoSelecionado?.motorista?.id) return;
      const chaveTipo = tipo === "esteril" ? "esteril" : "rocha";
      const capacidadeTipo = chaveTipo === "esteril" ? capacidadeEsterilTon : capacidadeRochaTon;
      if (!Number.isFinite(capacidadeTipo) || capacidadeTipo <= 0) {
        emitToast(`Capacidade de ${chaveTipo === "esteril" ? "estéril" : "rocha"} não configurada para este veículo.`, "warning");
        return;
      }
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(50);
        }
      } catch {
        /* ambientes sem vibração */
      }
      const ts = Date.now();
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
        emitToast("Não foi possível salvar o registro no dispositivo.", "error");
        return;
      }
      setHojeContagem((prev) => ({
        ...prev,
        [chaveTipo]: prev[chaveTipo] + 1,
        tonTotal: (Number(prev.tonTotal) || 0) + capacidadeTipo,
      }));
      pushLancamentoLocal({
        tipo,
        timestamp: ts,
        localId: id_local,
        veiculo_id: viagem.veiculo_id,
        motorista_id: viagem.motorista_id,
        tonDelta: capacidadeTipo,
      });
      showRegistradoOk(tipo);

      const ctx = {
        viagem,
        chaveTipo,
        id_local,
        undone: false,
        serverViagemId: null,
      };

      const mensagem = tipo === "esteril" ? "✔ Estéril registrado" : "✔ Rocha registrado";
      emitToast(mensagem, "success", {
        durationMs: 5000,
        actionLabel: "Desfazer",
        onAction: () => {
          if (ctx.undone) return;
          ctx.undone = true;
          void deleteViagemLocal(ctx.id_local).catch(() => {});
          setHojeContagem((prev) => ({
            ...prev,
            [ctx.chaveTipo]: Math.max(0, prev[ctx.chaveTipo] - 1),
            tonTotal: Math.max(0, (Number(prev.tonTotal) || 0) - capacidadeTipo),
          }));
          setUltimosLancamentos((prev) => prev.filter((item) => item.id !== ctx.id_local));
          void removerViagemNoServidor(ctx);
          void refreshPendentesCount();
          void refreshContagemHoje();
        },
      });

      try {
        const { data } = await api.post(
          "/apontador/viagens",
          {
            veiculo_id: viagem.veiculo_id,
            motorista_id: viagem.motorista_id,
            tipo: viagem.tipo,
            timestamp: viagem.timestamp,
          },
          { skipGlobalErrorToast: true }
        );
        ctx.serverViagemId = data?.viagem?.id ?? null;
        if (ctx.serverViagemId) {
          setUltimosLancamentos((prev) =>
            prev.map((item) => (item.local_id === id_local ? { ...item, viagem_id: ctx.serverViagemId } : item))
          );
        }
        if (ctx.undone) {
          await removerViagemNoServidor(ctx);
          void refreshPendentesCount();
          void refreshContagemHoje();
          return;
        }
        await markAsSynced(id_local);
      } catch {
        /* mantém pendente no IndexedDB; contador já atualizado */
      }
      void refreshPendentesCount();
      void refreshContagemHoje();
    },
    [
      veiculoSelecionado,
      capacidadeEsterilTon,
      capacidadeRochaTon,
      showRegistradoOk,
      refreshPendentesCount,
      refreshContagemHoje,
      removerViagemNoServidor,
      pushLancamentoLocal,
    ]
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

  const podeRegistrar = temMotoristaVinculado && temMaterialConfigurado;
  const avisoApontador = !temMotoristaVinculado
    ? "Selecione um veículo com motorista vinculado"
    : !temMaterialConfigurado
      ? "Cadastre a capacidade de estéril ou rocha para este veículo"
      : "";
  const mostrarAvisoVeiculoInvalido =
    !loadingVeiculos && veiculos.length > 0 && !podeRegistrar;

  const textoPendentes =
    pendentesCount === 0
      ? null
      : pendentesCount === 1
        ? "1 registro pendente"
        : `${pendentesCount} registros pendentes`;
  const showSyncAction = !online || pendentesCount > 0;

  return (
    <div className="relative flex min-h-[100dvh] min-h-screen flex-col bg-slate-950 text-slate-100">
      <ApontadorHeader online={online} textoPendentes={textoPendentes} onSyncManual={onSyncManual} showSyncAction={showSyncAction} />

      <ApontadorRegistradoFlash open={registradoFlash.open} visibleIn={registradoFlash.in} message={registradoFlash.label} />

      <h1 className="sr-only">Apontador — registro de viagens</h1>

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
              <strong className="text-amber-50">capacidade para estéril ou rocha</strong> e{" "}
              <strong className="text-amber-50">motorista vinculado</strong> na gestão da empresa.
            </p>
          )}

          <ApontadorTipoButtons
            podeRegistrar={podeRegistrar}
            avisoInvalido={mostrarAvisoVeiculoInvalido}
            avisoMensagem={avisoApontador}
            capacidadeEsterilTon={capacidadeEsterilTon}
            capacidadeRochaTon={capacidadeRochaTon}
            onEsteril={() => {
              void registrar("esteril");
            }}
            onRocha={() => {
              void registrar("rocha");
            }}
          />

          <ApontadorHojeResumo
            esteril={hojeContagem.esteril}
            rocha={hojeContagem.rocha}
            tonTotal={hojeContagem.tonTotal}
            ultimosLancamentos={ultimosLancamentos}
            onDesfazerLancamento={(item) => {
              void desfazerLancamento(item);
            }}
            desfazendoLancamentoId={desfazendoLancamentoId}
            onLimparDia={() => setLimparDiaModalOpen(true)}
          />
        </div>
      </main>

      {limparDiaModalOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4"
          role="presentation"
          onClick={() => !limparDiaEmCurso && setLimparDiaModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fc-apontador-limpar-dia-titulo"
            className="w-full max-w-md rounded-2xl border border-slate-600 bg-slate-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="fc-apontador-limpar-dia-titulo" className="text-lg font-semibold text-slate-100">
              Resetar dia?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Isto apaga no <strong className="text-slate-100">dispositivo</strong> as viagens de hoje (fuso São Paulo)
              dos veículos desta lista, e no <strong className="text-slate-100">servidor</strong> os lançamentos de
              hoje deste apontador. A ação fica registada em auditoria.
            </p>
            <p className="mt-2 text-xs text-amber-200/90">Não pode ser desfeita automaticamente.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={limparDiaEmCurso}
                onClick={() => void executarLimparDia()}
                className="fc-btn rounded-lg border border-rose-400/40 bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
              >
                {limparDiaEmCurso ? "A resetar…" : "Confirmar reset"}
              </button>
              <button
                type="button"
                disabled={limparDiaEmCurso}
                onClick={() => setLimparDiaModalOpen(false)}
                className="fc-btn rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
