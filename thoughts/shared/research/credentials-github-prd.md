# PRD de Pesquisa: Aba Credentials (GitHub) no estilo n8n

## Objetivo
Implementar/ajustar a experiência de **Credentials** para GitHub seguindo o padrão visual e funcional do n8n (gerenciamento de credenciais por serviço, modal com estrutura orientada a conexão e documentação rápida).

---

## 1) Onde a funcionalidade será injetada

## Navegação principal
A navegação principal está em `src/App.tsx` no componente `MainDashboard`.

Pontos atuais:
- Estado de view: `view` com chave `"settings"` rotulada como **Credentials**.
- Menu superior: array `menuItems` já contém `{ key: "settings", label: "Credentials", emoji: "🔐" }`.
- Renderização da view: quando `view === "settings"`, o app renderiza `DeptSettings` (ou `TeamSettings` via `settingsTab`).

Arquivos-chave:
- `src/App.tsx`
- `src/components/DeptSettings.tsx`

## Entrada da feature Credentials
`DeptSettings` já é o entry point da tela de credenciais:
- Lista credenciais existentes via `api.integrations.listByOrg`
- Abre galeria de serviços (`CredentialGalleryModal`)
- Abre modal específico por serviço (`CredentialModal`)

Arquivo-chave:
- `src/components/DeptSettings.tsx`

---

## 2) Componentes de UI existentes para reaproveitar

## Reaproveitar imediatamente
- **Cards de credenciais**: `src/components/integrations/CredentialList.tsx`
  - já possui status badge (`connected/pending/error`)
  - já exibe `lastSyncAt` (tempo relativo)
- **Galeria com busca**: `src/components/integrations/CredentialGalleryModal.tsx`
  - modal base + busca + grid por serviço
- **Modal de configuração por serviço**: `src/components/integrations/CredentialModal.tsx`
  - já tem forms específicos (GitHub incluído)
- **Logos por serviço**: `src/components/integrations/ServiceLogo.tsx`

## Padrões visuais reutilizáveis
- Modal shell/painel com header e close: padrão em `TopNav` e integrações
- Inputs, labels, botões primários/secundários já padronizados em Tailwind utilitário
- Banner informativo/erro: já usado em `CredentialModal` (ex: Gmail/Notion)

## Componentes novos recomendados (para aproximar do n8n)
1. `CredentialDetailLayout`
- layout com **sidebar de abas** e conteúdo à direita
- abas: `Connection`, `Sharing`, `Details`

2. `CredentialDocsLink`
- bloco pequeno com link “Open docs” (externo/interno)

3. `CredentialConnectionStatus`
- banner/status padronizado no topo do modal

4. `CredentialFieldRow` (opcional)
- padronizar pares label+input+hint

---

## 3) Estado atual de armazenamento de credenciais/segredos

## Tabela e schema
Tabela atual: `integrations` em `convex/schema.ts`.

Campos relevantes:
- `orgId`, `departmentId`
- `name`, `type`
- `config: v.any()` (onde ficam tokens/chaves/URLs)
- `authType` (ex: `apikey`, `oauth2`)
- `oauthStatus` (ex: `connected`, `pending`, `error`)
- `lastSyncAt`, `lastError`

Observação:
- Hoje `config` é flexível e já suporta os campos do GitHub.
- Ainda não há criptografia explícita por campo no schema (é um ponto de segurança para backlog).

## Operações backend
Arquivo: `convex/integrations.ts`

Já existe validação por tipo:
- `github` exige `token` e `defaultRepo`

Mutations/queries já prontas:
- `listByOrg`
- `upsert`
- `remove`
- `getByTypeForDepartment` (consumo por tools)

---

## 4) Relação Tool <-> Credencial (estado atual)

As tools leem credenciais da tabela `integrations` via `internal.integrations.getByTypeForDepartment`.

Exemplos:
- GitHub: `convex/tools/github.ts`
  - requer `config.token`
  - pode usar `config.defaultRepo` para derivar `owner/repo`
- Notion: `convex/tools/notion.ts`
  - `config.token`, `config.parentPageId`
- Resend: `convex/tools/email.ts`
  - `config.token`, `config.fromEmail`

Orquestração:
- `convex/brain.ts` executa tools conforme permissões (`allowedTools`)
- Mapa de capabilities/tools em `convex/agents.ts` (`CAPABILITY_TOOL_MAP`)

Conclusão:
- A arquitetura já suporta perfeitamente “cada Tool depende de sua Credential”.
- Falta elevar UX para o padrão n8n de configuração/descoberta e documentação.

---

## 5) Requisitos GitHub (referência n8n) aplicados ao Plug and Say

## Campos necessários (Connection)
- `GitHub Server` (default: `https://api.github.com`)
- `User` (opcional no MVP, útil para override)
- `Access Token`
- `Default Repository (owner/repo)` (já existente no sistema e útil para tools)

## Métodos de autenticação
1. **API Access Token (Classic)**
- Implementação imediata (já compatível)

2. **OAuth2**
- Planejar como modo alternativo em `authType: "oauth2"`
- Exige rota callback + token exchange + persistência de refresh/access

## UX n8n-like para GitHub Credential
No `CredentialModal`, adotar estrutura:
- Sidebar com abas:
  - `Connection`
  - `Sharing`
  - `Details`
- Footer com botão `Save`
- Link `Open docs`

---

## 6) Conteúdo sugerido da documentação interna (Open docs)

Página interna sugerida: `docs/credentials/github.md` (ou route equivalente no app).

## Título
**GitHub Credential (Plug and Say)**

## Seções
1. **When to use**
- Conectar agentes para abrir issues, criar PRs e automações GitHub.

2. **Authentication methods**
- **API Access Token (Classic)** (recomendado para início)
- **OAuth2** (para governança e rotação centralizada)

3. **Required fields**
- GitHub Server (default: `https://api.github.com`)
- User
- Access Token
- Default Repository (`owner/repo`)

4. **How to create a Classic PAT**
- GitHub > Settings > Developer settings > Personal access tokens
- Selecionar escopos mínimos:
  - `repo` (privados/públicos conforme necessidade)
  - `read:org` (se necessário)
  - `workflow` (se automação exigir)

5. **Security best practices**
- Princípio de menor privilégio
- Rotação periódica do token
- Ambiente dedicado por organização/departamento

6. **Troubleshooting**
- 401 Unauthorized: token inválido/expirado
- 404 Repo not found: `owner/repo` incorreto ou permissão ausente
- 403 rate limit: revisar quota/token

7. **Tool mapping**
- `create_github_issue` usa esta credencial
- `create_pull_request` usa esta credencial

---

## 7) Plano de implementação (incremental)

1. **Refatorar UI do GitHub Credential para layout com abas**
- Expandir `CredentialModal` para shell n8n-like
- Incluir `Connection/Sharing/Details`

2. **Adicionar campos GitHub Server e User no config**
- Backend: ampliar validação sem quebrar compatibilidade
- Tools: usar `server` para endpoint base quando informado

3. **Adicionar Open docs**
- Link visível no modal
- Página de docs com conteúdo acima

4. **Preparar trilha OAuth2 GitHub (fase 2)**
- `generateAuthUrlGithub`
- callback HTTP
- persistência `oauthStatus`, `lastError`, `lastSyncAt`

5. **Observabilidade e qualidade**
- Exibir erro técnico de conexão no banner
- Atualizar `lastSyncAt` após validação bem-sucedida

---

## 8) Riscos e decisões

- `config: any` acelera evolução, mas aumenta risco de inconsistência.
- Recomenda-se criar schema lógico por tipo (validação forte) no backend.
- OAuth2 GitHub deve ser faseada para não bloquear o fluxo com PAT.

---

## 9) Resumo executivo

- O app já possui estrutura funcional de Credentials (listagem, galeria, modal e persistência).
- A principal lacuna é UX n8n-like (abas laterais, docs, método auth explícito).
- A relação Tool↔Credential já está pronta no backend e pode ser escalada com GitHub OAuth2 numa fase seguinte.
