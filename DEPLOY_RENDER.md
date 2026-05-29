# Deploy no Render (FrotaControl)

Dois serviços: **Web Service** (API Node) + **Static Site** (frontend Vite). Opcional: **PostgreSQL** gerenciado pela Render.

## 1. Banco PostgreSQL

1. Crie um **PostgreSQL** na Render.
2. Copie a **Internal Database URL** ou **External** (com `sslmode=require` se necessário).
3. Use como `DATABASE_URL` no backend.

### Schema PostgreSQL (estrutura das tabelas)

- **ORM:** o projeto **não usa Prisma** (nem Knex/Sequelize). Tudo é **SQL manual** via `pg`.
- **Onde está o “schema”:** único lugar canônico — `backend/src/db.js`, função **`initDb()`** (enum `user_role`, `CREATE TABLE IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS`, índices e constraints). **Não existe** pasta `migrations/` nem arquivos Prisma.
- **Produção = mesmo schema que local:** `initDb()` é **idempotente** (pode rodar várias vezes sem duplicar objetos).
- **Automático no Render:** ao subir o Web Service, `npm start` → `server.js` chama **`await initDb()`** antes de abrir a porta. Com `DATABASE_URL` do Postgres da Render (e SSL conforme `db.js`), as tabelas são criadas/atualizadas sozinhas.
- **Comando único manual (opcional):** na pasta `backend`, com a mesma `DATABASE_URL` que você usa em produção:

```bash
npm run db:init
```

  Equivale a rodar só `initDb()` e sair (útil para testar a string de conexão antes do deploy ou para rodar de uma máquina local contra o banco remoto). De um PC local para Postgres da Render, use a URL **externa** e, em geral, `NODE_ENV=production` ou `?sslmode=require` na URL para o pool habilitar TLS (`backend/src/db.js`).

## 2. Backend (Web Service)

| Campo | Valor |
|--------|--------|
| Root directory | `backend` |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/api/health` |

### Variáveis de ambiente (obrigatórias)

| Chave | Exemplo / notas |
|--------|------------------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Connection string do Postgres |
| `JWT_SECRET` | Segredo longo e aleatório |
| `JWT_EXPIRES_IN` | `30d` (opcional) |

### Recomendadas

| Chave | Notas |
|--------|--------|
| `PUBLIC_BASE_URL` ou `BACKEND_PUBLIC_URL` | `https://seu-api.onrender.com` — URLs absolutas em PDFs e logos |
| `FRONTEND_URL` | URL do static site — usada pelo Puppeteer para PDF do Relatório BI |
| `CORS_STRICT` | `false` (padrão) = `origin: true` para o frontend Render |
| `CORS_STRICT` + `CORS_ORIGINS` | Se `CORS_STRICT=true`, liste origens separadas por vírgula |
| `DATABASE_SSL` | `false` apenas se o Postgres local não usar SSL |

### SSL do Postgres

Em `NODE_ENV=production`, o pool usa SSL por padrão. Para Postgres local sem SSL: `DATABASE_SSL=false`.

### PDF (Relatório BI)

Exportação via **Puppeteer**: o backend abre a página React `/relatorio-inteligencia` e gera PDF fiel ao HTML.

| Chave | Notas |
|--------|--------|
| `FRONTEND_URL` | URL pública do static site (ex.: `https://seu-app.onrender.com`) — **obrigatória** para PDF |
| `PUPPETEER_EXECUTABLE_PATH` | (Opcional) Caminho do Chromium no servidor, se não usar o bundled |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `true` se usar Chromium do sistema |

O build do backend instala o Chromium do Puppeteer (`npm install`). Em planos Render limitados, configure `PUPPETEER_EXECUTABLE_PATH` para um Chromium disponível no ambiente.

## 3. Frontend (Static Site)

| Campo | Valor |
|--------|--------|
| Root directory | `frontend` |
| Build command | `npm install && npm run build` |
| Publish directory | `dist` |

### Variáveis de build

| Chave | Valor |
|--------|--------|
| `VITE_API_URL` | `https://seu-api.onrender.com` (sem `/api` no final) |

**Importante:** `VITE_API_URL` é fixada no **build**. Ao mudar a URL da API, faça um **redeploy** do static site.

## 4. PWA

O app inclui `manifest.json` e `sw.js` em `public/`. Após o deploy HTTPS, o navegador pode oferecer **Adicionar à tela inicial**.

## 5. Blueprint (opcional)

Na raiz do repositório existe `render.yaml` como ponto de partida. Ajuste nomes, região e defina segredos (`DATABASE_URL`, `JWT_SECRET`, `VITE_API_URL`) no painel ou via secrets da Render.

## 6. Checklist pós-deploy

- `GET https://seu-api.onrender.com/api/health` → JSON com `success: true`
- Login motorista (CPF), admin empresa, super admin
- Lançamento offline + sincronização contra a API remota
- Exportações Excel no painel

## 7. Primeiro uso em produção

O seed automático **não** roda com `NODE_ENV=production`. Crie empresa e usuários pelo fluxo super-admin ou scripts de migração, conforme sua operação.
