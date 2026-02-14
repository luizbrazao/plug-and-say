# Spec Técnica: Aba de Credenciais GitHub (Estilo n8n)

## 1) Escopo
Esta spec descreve a implementação da credencial GitHub na aba **Credentials** do Plug and Say, com UX inspirada no n8n.

Inclui:
- Modal específico GitHub com navegação lateral por abas (`Connection`, `Sharing`, `Details`).
- Banner de ajuda com link para documentação interna.
- Campos de conexão GitHub (Server, User, Access Token).
- Contrato TypeScript da credencial.
- Fluxo de validação e persistência em `integrations`.
- Mapeamento de arquivos.

Não inclui nesta fase:
- Implementação completa OAuth2 GitHub (apenas estrutura/plano).
- Criptografia dedicada por campo.

---

## 2) Estado Atual e Ponto de Entrada

## Navegação principal
- `src/App.tsx` já expõe a view **Credentials** no menu principal (`view === "settings"`).
- A tela atual é renderizada por `src/components/DeptSettings.tsx`.

## Fluxo atual de credenciais
1. Usuário clica em **Create Credential**.
2. `CredentialGalleryModal` abre e seleciona serviço.
3. `CredentialModal` abre com formulário específico por serviço.
4. Persistência via `api.integrations.upsert`.

## Storage atual
Tabela Convex: `integrations` (`convex/schema.ts`)
- `orgId`, `departmentId`, `name`, `type`, `config`, `authType`, `oauthStatus`, `lastSyncAt`, `lastError`.

---

## 3) Objetivo UX (n8n-like)

## Componente alvo: `GitHubCredentialModal`
Substituir o bloco GitHub inline atual em `CredentialModal` por uma composição dedicada, com estrutura:

- Header:
  - Logo do serviço + título `GitHub API`.
  - subtítulo curto.
- Corpo em 2 colunas:
  - Sidebar (abas)
    - `Connection`
    - `Sharing`
    - `Details`
  - Conteúdo da aba ativa
- Footer:
  - botão primário `Save`
  - botão secundário `Cancel`

## Aba Connection
Campos:
- `GitHub Server`
  - default: `https://api.github.com`
  - obrigatório
- `User`
  - opcional (fallback para owner derivado de `defaultRepo`)
- `Access Token`
  - obrigatório
  - input tipo `password`

Banner fixo de ajuda:
- Texto: `Need help filling out these fields? Open docs`
- `Open docs` aponta para documentação interna da credencial GitHub.

## Aba Sharing (MVP)
- Bloco de leitura informando escopo atual:
  - “Credentials are org-scoped and shared across departments in this organization.”
- Sem lógica de permissionamento granular nesta fase.

## Aba Details (MVP)
- Metadados read-only quando integração existir:
  - `Credential name`
  - `Auth type`
  - `Status`
  - `Last sync`
  - `Last error` (se houver)

---

## 4) Contratos TypeScript

## Tipo base de config GitHub
Criar tipo explícito para reduzir `any`:

```ts
export type GithubCredentialConfig = {
  server: string;          // default https://api.github.com
  user?: string;           // opcional
  token: string;           // obrigatório
  defaultRepo?: string;    // opcional no modal GitHub; mantém compatibilidade com tools
};
```

## Tipo para payload de upsert (GitHub)

```ts
export type GithubCredentialUpsertInput = {
  orgId: Id<"organizations">;
  departmentId?: Id<"departments">;
  name: "GitHub API";
  type: "github";
  config: GithubCredentialConfig;
  authType: "apikey" | "oauth2";
  oauthStatus?: "connected" | "pending" | "error";
  lastError?: string;
};
```

## Compatibilidade retroativa
- Se integração antiga não tiver `server`, usar fallback `https://api.github.com` no frontend e backend.

---

## 5) Validação e Persistência

## Frontend (pré-validação)
No submit da aba Connection:
- `server` obrigatório e deve iniciar com `http://` ou `https://`.
- `token` obrigatório.
- `user` opcional.

Erro de validação exibido no bloco de erro do modal.

## Backend (`convex/integrations.ts`)
Atualizar `validateIntegrationConfig("github", config)` para:
- obrigatórios: `token`, `server`
- opcionais: `user`, `defaultRepo`

Sugestão de regra:
- manter `defaultRepo` **opcional** no novo fluxo GitHubCredentialModal.
- se produto decidir manter obrigatório para automações atuais, incluir campo no modal com label `Default Repository (owner/repo)`.

## Persistência
Salvar via `upsert`:
- `name: "GitHub API"`
- `type: "github"`
- `config: { server, user, token, defaultRepo? }`
- `authType: "apikey"`
- `oauthStatus: "connected"`
- `lastError: ""`

---

## 6) Integração com Tools

Arquivo relevante: `convex/tools/github.ts`.

Ajustes planejados:
- Ler `config.server` e usar como base URL (fallback `https://api.github.com`).
- Manter suporte a `defaultRepo` para inferir `owner/repo`.
- `token` segue obrigatório.

Exemplo:
- `const server = integration?.config?.server?.trim() || "https://api.github.com";`
- endpoint passa a ser `${server}/repos/${owner}/${repo}/issues` e `${server}/repos/${owner}/${repo}/pulls`.

---

## 7) Disparo do Modal na aba principal

Fluxo não muda estruturalmente:
- `DeptSettings` já abre `CredentialGalleryModal`.
- Seleção `github` continua setando `activeService = "github"`.
- `CredentialModal` internamente renderiza `GitHubCredentialModal` quando `service === "github"`.

Decisão técnica:
- manter `CredentialModal` como orquestrador.
- extrair seção GitHub para componente dedicado para reduzir complexidade do arquivo atual.

---

## 8) Documentação interna

## Local
Opção recomendada (fase 1 rápida):
- arquivo markdown: `docs/credentials/github.md`

Opção alternativa (fase 2):
- componente help interno em `src/components/docs/CredentialGithubDocs.tsx` + rota/view docs.

## Conteúdo mínimo
1. O que é a credencial GitHub.
2. Método **API Access Token (Classic)** (passo a passo).
3. Método **OAuth2** (conceitual + pré-requisitos).
4. Campos do formulário:
   - GitHub Server
   - User
   - Access Token
5. Escopos recomendados de token.
6. Troubleshooting:
   - 401, 403, 404.

## Link no modal
- `Open docs` deve abrir a doc interna.
- enquanto rota interna não existir, fallback temporário para arquivo estático/docs route configurada.

---

## 9) Mapeamento de Arquivos (criar/modificar)

## Criar
1. `src/components/integrations/GitHubCredentialModal.tsx`
- Modal/tab layout específico do GitHub.

2. `src/components/integrations/CredentialHelpBanner.tsx`
- Banner reutilizável `Need help filling out these fields? Open docs`.

3. `src/components/integrations/types.ts`
- Tipos compartilhados (`GithubCredentialConfig`, etc.).

4. `docs/credentials/github.md`
- Página de documentação interna.

## Modificar
1. `src/components/integrations/CredentialModal.tsx`
- Delegar render de `service === "github"` para `GitHubCredentialModal`.

2. `convex/integrations.ts`
- Ajustar validação GitHub para novo contrato (`server`, `token`, `user?`).

3. `convex/tools/github.ts`
- Usar `config.server` com fallback e manter compatibilidade.

4. `src/components/DeptSettings.tsx` (se necessário)
- Sem mudança funcional obrigatória; apenas ajustes de props/tipagem se extração do modal exigir.

5. `src/App.tsx` (opcional)
- Somente se for necessário plugar rota/visualização para docs internos.

---

## 10) Critérios de Aceite

1. Selecionar `GitHub` na galeria abre modal n8n-like com abas laterais.
2. Aba `Connection` mostra campos:
   - GitHub Server (default preenchido)
   - User
   - Access Token (password)
3. Banner de ajuda aparece com link `Open docs` funcional.
4. Salvar credencial persiste em `integrations` com `type: "github"`.
5. Tools GitHub continuam funcionando com credenciais novas e antigas.
6. Erros de validação aparecem de forma clara no modal.

---

## 11) Plano de Entrega

Fase A (UI + Contrato)
- Extrair `GitHubCredentialModal`.
- Implementar abas e banner de ajuda.
- Tipos TS compartilhados.

Fase B (Backend)
- Ajustar validação em `integrations.ts`.
- Ajustar `tools/github.ts` para `server`.

Fase C (Docs)
- Criar `docs/credentials/github.md`.
- Conectar `Open docs`.

Fase D (QA)
- Teste manual de criação/edição.
- Teste de criação de issue/PR com credencial nova.
- Regressão para credenciais legadas.

---

## 12) Riscos e Mitigações

1. **Quebra de compatibilidade por mudança de validação**
- Mitigação: fallback para configs antigas e validação tolerante no rollout.

2. **Vazamento de token em UI/log**
- Mitigação: inputs password, não logar payload completo.

3. **Docs link quebrado**
- Mitigação: fallback para URL estável até rota interna final.

