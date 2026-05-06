# Deploy no Render (FrotaControl)

Dois serviços: **Web Service** (API Node) + **Static Site** (frontend Vite). Opcional: **PostgreSQL** gerenciado pela Render.

## 1. Banco PostgreSQL

1. Crie um **PostgreSQL** na Render.
2. Copie a **Internal Database URL** ou **External** (com `sslmode=require` se necessário).
3. Use como `DATABASE_URL` no backend.

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
| `CORS_STRICT` | `false` (padrão) = `origin: true` para o frontend Render |
| `CORS_STRICT` + `CORS_ORIGINS` | Se `CORS_STRICT=true`, liste origens separadas por vírgula |
| `DATABASE_SSL` | `false` apenas se o Postgres local não usar SSL |

### SSL do Postgres

Em `NODE_ENV=production`, o pool usa SSL por padrão. Para Postgres local sem SSL: `DATABASE_SSL=false`.

### PDF (Puppeteer)

No plano free do Render o Chrome pode não estar instalado. Se a exportação PDF falhar, configure `PUPPETEER_EXECUTABLE_PATH` conforme a imagem do serviço ou use [documentação Render + Puppeteer](https://render.com/docs).

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
- Exportações PDF/Excel no painel (se Puppeteer OK)

## 7. Primeiro uso em produção

O seed automático **não** roda com `NODE_ENV=production`. Crie empresa e usuários pelo fluxo super-admin ou scripts de migração, conforme sua operação.
