import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useAuth } from "../services/auth";
import EmptyState from "../components/EmptyState";

const toYmd = (raw) => String(raw || "").slice(0, 10);
const cleanText = (value) => String(value || "").trim();
const rowDate = (row) => toYmd(row?.payload?.data || row?.payload?.recorded_at_client || row?.updatedAt);

export default function RomaneioPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/app/historico");
        if (!active) return;
        const items = (Array.isArray(data?.items) ? data.items : [])
          .filter((row) => row?.module === "romaneios")
          .sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
        setRows(items);
      } catch (err) {
        if (!active) return;
        setRows([]);
        setError(err?.response?.data?.message || "Não foi possível carregar os transportes.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const groupedRows = useMemo(() => {
    const grouped = new Map();
    for (const row of rows) {
      const payload = row?.payload || {};
      const ymd = rowDate(row);
      const material = cleanText(payload.tipo_transporte || payload.material || "Sem material");
      const destino = cleanText(payload.destino || "-");
      const key = `${ymd}|${material}|${destino}`;
      const current = grouped.get(key) || {
        key,
        data: ymd,
        material,
        destino,
        quantidade: 0,
      };
      current.quantidade += Number(payload.quantidade || payload.viagens || 1) || 1;
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const materialTerm = cleanText(materialFilter).toLowerCase();
    return groupedRows.filter((row) => {
      if (dateStart && row.data && row.data < dateStart) return false;
      if (dateEnd && row.data && row.data > dateEnd) return false;
      if (materialTerm && !row.material.toLowerCase().includes(materialTerm)) return false;
      return true;
    });
  }, [groupedRows, materialFilter, dateStart, dateEnd]);

  const clearFilters = () => {
    setMaterialFilter("");
    setDateStart("");
    setDateEnd("");
  };

  const totalQuantidade = useMemo(() => {
    return filteredRows.reduce((acc, row) => acc + (Number(row.quantidade) || 0), 0);
  }, [filteredRows]);

  if (loading) return <div className="fc-card p-4 text-sm text-slate-300">Carregando transportes...</div>;
  if (error) return <div className="fc-card p-4 text-sm text-red-300">{error}</div>;

  return (
    <div className="space-y-3">
      <section className="fc-card p-4">
        <h2 className="text-lg font-semibold text-white">Transporte realizado</h2>
        <p className="mt-1 text-sm text-slate-300">
          Motorista: {user?.nome} | Veículo: {user?.veiculo_nome || "-"}
        </p>
        <p className="mt-2 text-xs text-slate-400">Tela detalhada e somente leitura para conferência operacional dos transportes.</p>
      </section>

      <section className="fc-card p-4">
        <h3 className="text-sm font-semibold text-white">Filtros rápidos</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-slate-300">
            De
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-300">
            Até
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-300">
            Material
            <input
              type="text"
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              placeholder="Ex.: brita"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-400">Quantidade total no filtro: {totalQuantidade}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="fc-btn btn-secondary rounded-lg px-3 py-1.5 text-xs"
          >
            Limpar filtros
          </button>
        </div>
      </section>

      <section className="fc-card p-4">
        <h3 className="text-sm font-semibold text-white">Lista de transportes</h3>
        {!filteredRows.length ? (
          <div className="mt-3">
            <EmptyState compact title="Sem transportes para os filtros atuais" description="Ajuste os filtros para visualizar os romaneios do período desejado." />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3">Data</th>
                  <th className="pb-2 pr-3">Material</th>
                  <th className="pb-2 pr-3">Destino</th>
                  <th className="pb-2">Quantidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredRows.map((row) => {
                  return (
                    <tr key={row.key}>
                      <td className="py-2.5 pr-3 text-slate-300">{row.data || "—"}</td>
                      <td className="py-2.5 pr-3 text-slate-200">{row.material || "—"}</td>
                      <td className="py-2.5 pr-3 text-slate-200">{row.destino || "—"}</td>
                      <td className="py-2.5 text-slate-100">{row.quantidade}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
