# FrotaMax

Sistema SaaS de controle operacional de frota com app motorista mobile-first, painel web gestor, funcionamento offline-first e sincronização automática.

## Stack

- Frontend: React + Vite + TailwindCSS + IndexedDB + PWA
- Backend: Node.js + Express + PostgreSQL + JWT

## Estrutura

- `backend/`: API, autenticação, multiempresa, CRUD e exportações
- `frontend/`: aplicação PWA, módulos operacionais, histórico local e sync

## Backend - execução

1. Copie `backend/.env.example` para `backend/.env`.
2. Ajuste `DATABASE_URL` para seu PostgreSQL.
3. Execute:

```bash
cd backend
npm install
npm run dev
```

As tabelas são criadas automaticamente na inicialização.

## Seed automático (produção inicial)

Se o banco estiver vazio, o backend executa `backend/src/seed.js` automaticamente e cria:

- Empresa padrão: `Porto Central`
- Gestor admin:
  - login: `admin@frotacontrol.com`
  - senha: `123456`
  - empresa_id: `1`
- 2 motoristas de exemplo com veículos vinculados

## Frontend - execução

1. Copie `frontend/.env.example` para `frontend/.env`.
2. Execute:

```bash
cd frontend
npm install
npm run dev
```

## Painel administrativo

Com usuário gestor/admin, acesse:

- `/admin` para gerenciar empresas, motoristas e veículos (incluindo upload de logo)
- `/gestor` para dashboard e `/gestor/registros` para listagem/exportações

Recursos de produção no admin/listagens:

- paginação server-side
- busca com debounce
- skeleton loading
- lazy loading das telas

## Fluxo mínimo inicial

1. Fazer login com o admin seeded
2. Criar/ajustar empresas, motoristas e veículos em `/admin`
3. Login do motorista e lançamento dos módulos de campo
4. Sincronização automática ao reconectar + botão manual

## Exportações

- Excel: `GET /api/export/excel`
- PDF: `GET /api/export/pdf`

## Segurança e observabilidade

- Rate limit global na API
- Upload de logo com validação de tipo e tamanho (max 2MB)
- Política de senha mínima forte (8+ com maiúscula, minúscula e número)
- Auditoria automática em `audit_logs` para criar/editar/excluir
- Logs estruturados em `backend/logs/app.log`
- Hook preparado para integração futura com monitoramento externo (`MONITORING_DSN`)

## Compatibilidade app store

O frontend inclui configuração base do Capacitor (`frontend/capacitor.config.ts`) e scripts:

- `npm run cap:sync`
- `npm run cap:copy`
