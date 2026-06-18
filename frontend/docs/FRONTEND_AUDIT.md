# Auditoria técnica do frontend — FrotaMax

Documento gerado na auditoria incremental (PROMPT 4). Serve como mapa de riscos, duplicações e próximos passos seguros. **Não substitui testes E2E nem revisão de API.**

---

## 1. Mapa da estrutura (`frontend/src`)

| Área | Caminhos principais |
|------|---------------------|
| **Páginas** | `pages/*.jsx` (motorista, auth, gestão legado, apontador) |
| **Módulo empresa** | `modules/company/**` — `dashboard/`, `transport/`, `fuel/`, `daily/`, `fleet/`, `people/`, `contexts/`, `hooks/`, `shared/` |
| **Componentes shell** | `components/` — layouts, `LoadingState`, `FormField`, `RouteTransition`, etc. |
| **Hooks** | `hooks/` + hooks colocados junto aos módulos em `modules/company/**/hooks/` |
| **Contexts** | `modules/company/contexts/` (`FuelContext`, `TransportContext`, `DailyOperationsContext`) |
| **Services** | `services/api.js`, `auth.js`, `syncService.js`, `offlineViagens.js`, `uiEvents.js` |
| **Offline** | `offline/db.js`, `offline/offlineRepo.js` |
| **Utils** | `utils/datetime.js`, `id.js`, `numberParse.js`, `managerRecordsOperational.js`, `apontadorHome.js` |
| **Entrada** | `main.jsx`, `App.jsx` (rotas, lazy, proteções) |

### Arquivos críticos (alto impacto)

- `App.jsx` — rotas, sync motorista, toasts globais, listeners `window`.
- `services/auth.js` — sessão e redirecionamentos.
- `services/api.js` — todas as chamadas HTTP.
- `pages/ManagerRecordsPage.jsx` — relatórios/exportações (muito código; ver §2).

### Arquivos problemáticos (manutenção / tamanho)

| Ficheiro (aprox.) | Linhas | Risco |
|-------------------|--------|--------|
| `ManagerRecordsPage.jsx` | ~930+ após extração | UI + export + árvore + edição no mesmo ficheiro; próximo passo: subcomponentes de fila/linha e hook `useManagerRecords`. |
| `AdminPage.jsx` | ~780 | Gestão super-admin densa. |
| `ParteDiariaPage.jsx` | ~608 | Formulário longo; candidato a secções/hooks por bloco. |
| `CompanyManagementPage.jsx` | ~533 | CRUD empresa. |
| `EmpresaTransportePage.jsx` | ~508 | Já modularizado parcialmente com contexto; ainda grande visualmente. |
| `CombustivelPage.jsx` | ~430 | Fluxo motorista. |
| `ApontadorHomePage.jsx` | reduzido | Lógica de efeitos/sync mantida na página; UI extraída para `pages/apontador/ApontadorHomeSections.jsx`. |

---

## 2. Componentes grandes (>300–400 linhas)

**Estado atual:** rotas principais já usam `React.lazy` em `App.jsx` (code-splitting por rota).

**Melhorias já aplicadas nesta auditoria:**

- `utils/managerRecordsOperational.js` — datas, nomes de ficheiro, labels e `RELATORIOS_PORTO` extraídos de `ManagerRecordsPage.jsx` (funções puras, zero mudança de comportamento).
- `utils/apontadorHome.js` — `mapVeiculoApi`, `storageKeyVeiculo`.
- `pages/apontador/ApontadorHomeSections.jsx` — subcomponentes memoizados (flash, veículo, botões, resumo “Hoje”).

**Backlog recomendado (incremental):**

1. `ManagerRecordsPage` — extrair componente de linha da tabela/árvore + hook `useManagerRecordsFilters` / `useManagerRecordsExport`.
2. `AdminPage` / `ParteDiariaPage` — mesmo padrão: utilitários puros primeiro, depois JSX.

---

## 3. Prop drilling

| Zona | Observação |
|------|---------------|
| Motorista | `MotoristaLayout` recebe `pendingCount`, `online`, `syncStatus`, etc. — aceitável para um nível; evitar descer mais de 2 níveis sem contexto. |
| Empresa | Módulos já usam **contexts** por domínio (combustível, transporte, parte diária) — bom alinhamento com PROMPT 2. |
| Relatórios | `ManagerRecordsPage` concentra estado; não há drilling profundo, mas **estado monolítico** aumenta risco de re-renders. |

**Sugestão:** contexto só se o mesmo estado for necessário em irmãos distantes; caso contrário, hooks locais + componentes filhos.

---

## 4. Re-renderizações

- **Evitar** `useMemo`/`useCallback`/`memo` em massa sem medição.
- **Aplicado:** `memo` nos subcomponentes visuais do apontador (props estáveis ou primitivas).
- **Rever quando:** listas >100 linhas com edição inline ou árvore pesada (Profiler React).

---

## 5. Imports pesados / lazy

- **Charts:** consumo empresa usa lógica leve (`fuelPie.js` + CSS), sem biblioteca de charts pesada.
- **Lazy loading:** já aplicado às páginas em `App.jsx`; **não** foi introduzida nova dependência.
- **Oportunidade:** se no futuro se integrar Chart.js/Recharts, importar dentro do chunk da rota ou `lazy` do componente do gráfico.

---

## 6. Padronização

- **Loading global de rota / auth:** `ScreenLoading` em `components/LoadingState.jsx`, usado em `Suspense` e guards `Protected` / `PublicOnly` em `App.jsx`.
- **Estados vazios/erro:** padrão existente com `EmptyState`, `EmpresaModuleErrorPanel`, toasts `emitToast` — manter coerência ao extrair novas páginas.

---

## 7. Tratamento de erros

- API centralizada em `api.js` (interceptors / eventos).
- Módulos empresa: painel de retry explícito onde já existia.
- **Sugestão incremental:** onde ainda há `console.error` ou mensagem solta, alinhar a `emitToast` ou painel com ação “Tentar novamente”.

---

## 8. Validação

Checklist manual recomendado após cada alteração estrutural:

- [ ] `npm run validate` (build + eslint)
- [ ] Login motorista / empresa / apontador / super-admin (rotas reais)
- [ ] `/dashboard/relatorios` — filtros, paginação, export
- [ ] `/apontador` — seleção veículo, registo, offline/pendentes
- [ ] Viewport mobile (320px) nas páginas tocadas

---

## 9. Duplicação / código morto

- Formatadores de datas de relatórios estavam **só** em `ManagerRecordsPage`; agora reutilizáveis via `managerRecordsOperational.js` (base para eventual uso noutro relatório).
- Verificar periodicamente imports não usados com ESLint (`no-unused-vars` já no fluxo de validate).

---

*Última atualização: auditoria incremental PROMPT 4.*
