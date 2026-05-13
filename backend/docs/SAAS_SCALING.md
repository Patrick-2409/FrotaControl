# FrotaControl — escalabilidade SaaS multiempresa

Este documento descreve a direção arquitetural **sem obrigar implementação imediata** de módulos futuros (GPS, telemetria, BI, push).

## Multitenancy

- **Fonte de escopo**: `src/domain/tenantContext.js` — `resolveEmpresaScope` (leitura) e `resolveEmpresaScopeWrite` (escrita).
- **Regra**: utilizadores não `SUPER_ADMIN` só acedem a `req.user.empresa_id`. Super-admin deve indicar `empresa_id` explícito em query/corpo onde aplicável.
- **Modelos**: todas as queries que tocam dados de negócio devem filtrar por `empresa_id` (ou equivalente). Novos repositórios devem receber `empresa_id` como argumento obrigatório.
- **Cache (futuro)**: chaves devem incluir prefixo `empresa:{id}:` para evitar fugas entre inquilinos.

## Camadas backend

| Pasta            | Função                                              |
|-----------------|------------------------------------------------------|
| `controllers/` | HTTP, validação de entrada, status codes            |
| `services/`    | Orquestração por domínio (transporte, combustível, frota, operações diárias) |
| `repositories/`| Acesso a dados quando extrair SQL dos models fizer sentido |
| `validators/`  | Schemas reutilizáveis (ex.: paginação)               |

Rotas existentes mantêm URLs e contratos; refactors internos não devem alterar payloads sem versionamento.

## APIs

- Paginação: ver `src/validators/pagination.js` (`MAX_LIST_LIMIT`, etc.) para alinhar novas listagens.
- Respostas: preferir `{ success, data?, error?, message? }` em novos endpoints; legado pode coexistir.

## Mobile / offline

- Política de retry: `frontend/src/offline/syncPolicy.js`.
- Fila: `offlineRepo` + `syncService` — ordem FIFO por `owner_scope` (utilizador + empresa).

## Roadmap técnico (não implementado)

| Área                    | Notas |
|-------------------------|--------|
| Rastreamento GPS        | Ingestão de posições por `empresa_id` + `veiculo_id`; retenção e downsampling por política. |
| Telemetria              | Séries temporais; agregações assíncronas; separar de transações OLTP. |
| Manutenção preventiva   | Regras por veículo/empresa; alertas derivados de hodômetro/horímetro. |
| BI avançado             | Réplica read-only ou warehouse; não carregar relatórios pesados na API síncrona principal. |
| Notificações push       | Tópicos por `empresa_id`; opt-in por utilizador; fila de envio. |

## Testes

- `npm test` no backend (quando configurado) ou `node --test` nos ficheiros em `backend/test/`.
- Cenários críticos: dois `empresa_id` distintos não acedem aos mesmos registos com o mesmo JWT de perfil normal.
