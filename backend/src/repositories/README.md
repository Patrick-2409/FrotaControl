# Repositórios (camada de persistência)

Diretório reservado para **repositórios** que encapsulam SQL e políticas de tenant (`empresa_id` sempre em primeiro plano).

## Direção

- Hoje a maior parte do SQL vive em `models/*.js` (padrão legado, estável).
- Novas funcionalidades (ex.: BI, telemetria) devem preferir `repositories/` + serviços finos, mantendo **controllers** sem SQL direto.

## Multitenancy

Toda query que devolve dados de negócio deve filtrar por `empresa_id` derivado de `domain/tenantContext.js` ou de `req.user.empresa_id` (papéis não super-admin).

Não introduzir cache HTTP partilhado entre empresas sem chavear por tenant.
