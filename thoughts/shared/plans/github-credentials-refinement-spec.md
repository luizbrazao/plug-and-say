# Spec de Refinamento: GitHub Credentials UI Simplificada + Docs com Rota Real

## Objetivo
Refinar a implementação da credencial GitHub para:
1. **Remover complexidade visual** (eliminar sidebar de abas no modal).
2. **Corrigir navegação de documentação** com **rota React real** (evitar fallback para dashboard).
3. **Garantir consistência de navegação interna** usando componente de `Link` do router.

---

## 1) Problema Atual

## UI
- `GitHubCredentialModal` está com layout de abas laterais (`Connection`, `Sharing`, `Details`), mas o requisito mudou para um modal simples de etapa única.

## Docs
- Link de ajuda para `/docs/credentials/github/` cai no dashboard.
- Causa: app não usa router real; hoje o `App.tsx` só faz handling manual de `/join/:token` por `window.location.pathname`.

## Navegação interna
- `CredentialHelpBanner` usa `<a>` com navegação tradicional, causando reload e não respeitando SPA routing.

---

## 2) Escopo do Refinamento

## 2.1 Simplificação do `GitHubCredentialModal`
Remover completamente o menu lateral e abas.

Novo layout:
- Header do modal (logo + título + close).
- Corpo único com:
  - `CredentialHelpBanner` no topo
  - formulário abaixo
- Footer com ações:
  - botão secundário `Cancel`
  - botão primário `Save`

Campos obrigatórios/presentes:
- `GitHub Server` (default `https://api.github.com`)
- `User` (opcional)
- `Access Token` (password)

Campos opcionais que podem permanecer (sem destaque principal):
- `Default Repository (owner/repo)`

Remover do componente:
- estados/handlers/tab switch de `Connection`, `Sharing`, `Details`.
- seções de `Sharing` e `Details`.

---

## 2.2 Implementação real de rota de documentação

## Estratégia
Introduzir `react-router-dom` no app e migrar roteamento básico para SPA:
- rota principal: `/` -> `App`
- rota de docs: `/docs/credentials/github` -> página de documentação
- rota convite: `/join/:token` -> fluxo atual de convite (reutilizado)

## Página nova
Criar componente:
- `src/pages/docs/GitHubCredentialDoc.tsx`

Conteúdo:
- base no guia discutido (PAT + OAuth2).
- estrutura com H1/H2/listas/trechos de código.
- visual consistente com design do sistema (cores, tipografia, spacing atuais).

Observação de UX:
- página de docs pode ser "clean" (sem dashboard complexo), mas com estilo da marca.

---

## 2.3 Link interno sem reload

Atualizar `CredentialHelpBanner.tsx` para usar:
- `Link` de `react-router-dom` quando `href` for interno (`/docs/...`).
- fallback para `<a>` apenas em links externos (`http`, `https`).

Comportamento esperado:
- clique em `Open docs` abre docs em SPA, sem reload completo.

---

## 3) Arquitetura e Roteamento

## Estado atual (antes)
- `src/main.tsx` renderiza `<App />` diretamente.
- `src/App.tsx` lê `window.location.pathname` somente para convite.

## Estado alvo (depois)

### `src/main.tsx`
- envolver app com `BrowserRouter`.

### `src/App.tsx`
- remover dependência de `window.location.pathname` para roteamento.
- usar `useLocation` / `useParams` (via componentes de rota) para convite.
- manter lógica funcional existente, apenas reorganizada em rotas.

### Rotas sugeridas
- `/` -> `MissionControlApp` (dashboard)
- `/join/:token` -> `JoinInviteScreen`
- `/docs/credentials/github` -> `GitHubCredentialDoc`

---

## 4) Plano de Implementação

1. **Adicionar router**
- instalar/usar `react-router-dom`.
- configurar `BrowserRouter` em `main.tsx`.

2. **Criar página de docs**
- implementar `src/pages/docs/GitHubCredentialDoc.tsx` com conteúdo completo.

3. **Configurar rotas no App**
- declarar rotas para `/`, `/join/:token`, `/docs/credentials/github`.
- adaptar fluxo de convite para receber `token` por `useParams`.

4. **Refinar banner**
- atualizar `CredentialHelpBanner.tsx` para `Link` interno.

5. **Simplificar modal GitHub**
- remover sidebar de abas e consolidar UI em corpo único.
- manter validação/save atuais.

6. **Verificação final**
- typecheck (`npx tsc --noEmit`).
- validação manual dos fluxos.

---

## 5) Critérios de Aceite

1. Modal GitHub abre sem menu lateral.
2. Banner aparece no topo do corpo do modal.
3. Formulário contém Server, User e Access Token.
4. Save persiste credencial com sucesso.
5. Clique em `Open docs` vai para `/docs/credentials/github` sem cair no dashboard.
6. Página de docs renderiza conteúdo do guia GitHub (PAT/OAuth2, campos e troubleshooting).
7. Fluxo `/join/:token` continua funcional após adoção do router.

---

## 6) Arquivos a Modificar/Criar

## Criar
- `src/pages/docs/GitHubCredentialDoc.tsx`

## Modificar
- `src/main.tsx`
- `src/App.tsx`
- `src/components/integrations/CredentialHelpBanner.tsx`
- `src/components/integrations/GitHubCredentialModal.tsx`

## Opcional remover/ajustar
- `public/docs/credentials/github/index.html` (pode ser mantido como legado, mas não deve ser a fonte principal).
- `docs/credentials/github.md` (continua como fonte de conteúdo/referência editorial).

---

## 7) Riscos e Mitigações

1. **Migração de roteamento quebrar convite**
- Mitigação: criar teste manual explícito para `/join/:token` antes/depois.

2. **Conflito entre links internos e externos no banner**
- Mitigação: helper simples para detectar `href` absoluto e usar `<a>` externo só nesses casos.

3. **Regressão visual no modal**
- Mitigação: manter classes/padrões do Antigravity já usados em modais existentes.

---

## 8) Testes Manuais (checklist)

1. Abrir Credentials -> Create Credential -> GitHub.
2. Confirmar ausência de abas laterais.
3. Confirmar presença do banner e campos principais.
4. Clicar `Open docs` e validar rota `/docs/credentials/github`.
5. Voltar ao app e salvar credencial.
6. Validar credencial listada.
7. Acessar `/join/<token>` e confirmar fluxo de convite sem regressão.

