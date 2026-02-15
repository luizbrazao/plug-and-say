import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useOrg } from "../OrgContext";
import { dicebearBotttsUrl } from "../lib/avatar";
import { formatLocalizedDateTime, formatLocalizedTime } from "../lib/i18nTime";
import { ServiceLogo } from "./integrations/ServiceLogo";

type Status = "inbox" | "assigned" | "in_progress" | "review" | "done";

type AgentBySessionKey = Record<string, { name: string; avatar?: string }>;

type TaskInspectorProps = {
  departmentId: Id<"departments">;
  taskId: Id<"tasks"> | null;
  onClose: () => void;
  sessionKey: string;
  agentBySessionKey: AgentBySessionKey;
};

const STATUS_UPDATE_OPTIONS: Array<{ value: Status }> = [
  { value: "inbox" },
  { value: "assigned" },
  { value: "in_progress" },
  { value: "review" },
  { value: "done" },
];

const TOOL_NAME_REGEX = /\[TOOL:\s*([a-zA-Z0-9_-]+)/g;

const TOOL_BADGE_META: Record<string, { label: string; service?: string; icon?: string }> = {
  web_search: { label: "Search", service: "tavily" },
  search_knowledge: { label: "Knowledge", icon: "🧠" },
  delegate_task: { label: "Delegation", icon: "🧩" },
  update_task_status: { label: "Status", icon: "✅" },
  send_email: { label: "Email", service: "resend" },
  list_emails: { label: "List Emails", service: "gmail" },
  get_email_details: { label: "Email Details", service: "gmail" },
  search_emails: { label: "Search Emails", service: "gmail" },
  gmail_send_email: { label: "Gmail", service: "gmail" },
  gmail_list_inbox: { label: "Inbox", service: "gmail" },
  gmail_get_message: { label: "Message", service: "gmail" },
  gmail_list_labels: { label: "Labels", service: "gmail" },
  gmail_mark_read: { label: "Mark Read", service: "gmail" },
  gmail_mark_unread: { label: "Mark Unread", service: "gmail" },
  gmail_archive_message: { label: "Archive", service: "gmail" },
  gmail_unarchive_message: { label: "Unarchive", service: "gmail" },
  generate_image: { label: "Image", service: "dalle" },
  create_github_issue: { label: "GitHub Issue", service: "github" },
  create_pull_request: { label: "Pull Request", service: "github" },
  create_notion_page: { label: "Notion", service: "notion" },
  post_to_x: { label: "X", service: "twitter" },
};

function normalizeUiTaskStatus(input: unknown): Status {
  const normalized = String(input ?? "").toLowerCase();
  if (normalized === "blocked") return "in_progress";
  if (normalized === "inbox") return "inbox";
  if (normalized === "assigned") return "assigned";
  if (normalized === "in_progress") return "in_progress";
  if (normalized === "review") return "review";
  if (normalized === "done") return "done";
  return "assigned";
}

function hasMemoryUsedMarker(content: string) {
  return content.startsWith("[MEMORY_USED]");
}

function stripMemoryUsedMarker(content: string) {
  return content.replace(/^\[MEMORY_USED\]\s*/m, "").trim();
}

function isToolBlobContent(content: string) {
  const normalized = stripMemoryUsedMarker(content).trim();
  return normalized.startsWith("[TOOL:") || normalized.includes("[TOOL:");
}

function isImageDocumentUrl(content: string) {
  const normalized = content.trim();
  return /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)([?#]\S*)?$/i.test(normalized);
}

function extractToolNames(messages: Array<{ content?: string }>): string[] {
  const names = new Set<string>();
  for (const message of messages) {
    const content = String(message.content ?? "");
    for (const match of content.matchAll(TOOL_NAME_REGEX)) {
      const toolName = String(match[1] ?? "").trim().toLowerCase();
      if (!toolName) continue;
      names.add(toolName);
    }
  }
  return Array.from(names);
}

function subtaskStatusMeta(rawStatus: string): { label: string; className: string } {
  const status = normalizeUiTaskStatus(rawStatus);
  if (status === "done") return { label: "Done", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "review") return { label: "Review", className: "bg-indigo-100 text-indigo-700 border-indigo-200" };
  if (status === "in_progress") return { label: "In Progress", className: "bg-blue-100 text-blue-700 border-blue-200" };
  if (status === "assigned") return { label: "Assigned", className: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: "Inbox", className: "bg-slate-100 text-slate-700 border-slate-200" };
}

export function TaskInspector({
  departmentId,
  taskId,
  onClose,
  sessionKey,
  agentBySessionKey,
}: TaskInspectorProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "pt";
  const { activeOrgId, organizations } = useOrg();

  const snapshot = useQuery(
    api.tasks.getThreadSnapshot,
    taskId ? { taskId, limit: 50 } : "skip"
  );
  const docs = useQuery(
    api.documents.listByTask,
    taskId ? { taskId, limit: 20 } : "skip"
  );
  const inspectorPanel = useQuery(
    api.tasks.getInspectorPanel,
    taskId ? { departmentId, taskId } : "skip"
  );

  const currentUserId = useQuery(api.organizations.currentUserId);
  const createMessage = useMutation(api.messages.create);
  const setStatus = useMutation(api.tasks.setStatus);
  const approveTask = useMutation(api.tasks.approve);
  const requestThink = useAction(api.brain.think);

  const [draft, setDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<Status>("assigned");
  const [statusBusy, setStatusBusy] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRequestingReanalysis, setIsRequestingReanalysis] = useState(false);

  const activeOrg = useMemo(
    () => organizations?.find((org) => org._id === activeOrgId),
    [organizations, activeOrgId]
  );

  const canSetDoneDirectly = useMemo(() => {
    const ownerUserId = snapshot?.task?.ownerUserId as Id<"users"> | undefined;
    const isTaskOwner = Boolean(ownerUserId && currentUserId && ownerUserId === currentUserId);
    const isOrgAdmin = activeOrg?.role === "owner" || activeOrg?.role === "admin";
    return isTaskOwner || isOrgAdmin;
  }, [snapshot?.task?.ownerUserId, currentUserId, activeOrg?.role]);

  const extractedTools = useMemo(
    () => extractToolNames((snapshot?.messages ?? []) as Array<{ content?: string }>),
    [snapshot?.messages]
  );

  useEffect(() => {
    const status = snapshot?.task?.status;
    if (!status) return;
    setStatusDraft(normalizeUiTaskStatus(status));
  }, [snapshot?.task?._id, snapshot?.task?.status]);

  if (!taskId) return null;
  const selectedTaskId = taskId;

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    await createMessage({
      departmentId,
      taskId: selectedTaskId,
      fromSessionKey: sessionKey,
      content,
    });

    setDraft("");
  }

  async function onSaveStatus() {
    if (statusDraft === "done" && !canSetDoneDirectly) {
      window.alert(t("app.statusDoneAlert"));
      return;
    }

    setStatusBusy(true);
    try {
      await setStatus({
        departmentId,
        taskId: selectedTaskId,
        status: statusDraft,
        bySessionKey: sessionKey,
        reason: "ui_change",
      });
    } finally {
      setStatusBusy(false);
    }
  }

  async function onApproveTask() {
    setIsApproving(true);
    try {
      await approveTask({
        departmentId,
        taskId: selectedTaskId,
      });
      setStatusDraft("done");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("app.approveError");
      window.alert(message || t("app.approveError"));
    } finally {
      setIsApproving(false);
    }
  }

  async function onRequestReanalysis() {
    setIsRequestingReanalysis(true);
    try {
      const preferredAgentSessionKey =
        snapshot?.task?.assigneeSessionKeys?.[0] ??
        inspectorPanel?.task?.assigneeSessionKeys?.[0] ??
        "agent:main:main";

      await requestThink({
        departmentId,
        taskId: selectedTaskId,
        agentSessionKey: preferredAgentSessionKey,
        triggerKey: `manual_inspector_reanalysis:${String(selectedTaskId)}:${Date.now()}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Não foi possível solicitar re-análise agora.";
      window.alert(message);
    } finally {
      setIsRequestingReanalysis(false);
    }
  }

  const latestActivities = inspectorPanel?.recentActivities ?? [];
  const delegatedSubtasks = inspectorPanel?.subtasks ?? [];

  return (
    <div className="fixed inset-y-0 right-0 w-[520px] bg-white shadow-2xl border-l border-border-subtle z-50 flex flex-col transform transition-transform animate-in slide-in-from-right duration-300">
      <div className="p-8 border-b border-border-subtle flex items-center justify-between bg-white/50 backdrop-blur-sm">
        <div className="min-w-0">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary opacity-60">{t("kanban.drawer.title")}</h3>
          <div className="truncate text-xl font-bold mt-1 text-text-primary">
            {snapshot?.task?.title || t("kanban.drawer.syncing")}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-black/5 rounded-xl transition-all text-text-secondary"
        >
          <span className="text-xs font-bold uppercase tracking-tighter">{t("common.close")}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin">
        <div className="grid grid-cols-1 gap-6">
          <div className="glass-card p-5 space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70">{t("kanban.drawer.lifecycleStatus")}</div>
            <div className="flex gap-3">
              <select
                value={statusDraft}
                onChange={(event) => setStatusDraft(normalizeUiTaskStatus(event.target.value))}
                className="flex-1 bg-white border border-border-subtle rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all shadow-sm"
              >
                {STATUS_UPDATE_OPTIONS.map(({ value }) => {
                  const disabled = value === "done" ? !canSetDoneDirectly : false;
                  return (
                    <option key={value} value={value} disabled={disabled}>
                      {value === "done" && disabled
                        ? `${t(`status.${value}`)} (${t("kanban.drawer.approvalOnly")})`
                        : t(`status.${value}`)}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={() => { void onSaveStatus(); }}
                disabled={statusBusy}
                className="px-6 py-2.5 bg-text-primary text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-black transition-all shadow-md active:scale-95"
              >
                {t("common.update")}
              </button>
            </div>
            {normalizeUiTaskStatus(snapshot?.task?.status) === "review" ? (
              <button
                onClick={() => { void onApproveTask(); }}
                disabled={isApproving}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-emerald-700 transition-all shadow-md"
              >
                {isApproving ? t("kanban.drawer.approving") : t("kanban.drawer.approve")}
              </button>
            ) : null}
          </div>

          <div className="glass-card p-5 space-y-5">
            <div className="flex justify-between items-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70">Raciocínio do Agente</div>
              <div className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">
                TXN_{selectedTaskId.toString().slice(-6)}
              </div>
            </div>

            {latestActivities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-subtle bg-white/40 px-4 py-3 text-xs text-text-secondary">
                Nenhuma atividade recente registrada para esta task.
              </div>
            ) : (
              <div className="space-y-2.5">
                {latestActivities.slice(0, 6).map((activity) => (
                  <div key={activity._id} className="rounded-xl border border-border-subtle bg-white/70 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-text-secondary/70">
                        {String(activity.actorName ?? activity.type ?? "Agente")}
                      </div>
                      <div className="text-[10px] font-mono text-text-secondary/60">
                        {formatLocalizedTime(activity.createdAt, language)}
                      </div>
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-text-primary/90">{activity.message}</div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { void onRequestReanalysis(); }}
              disabled={isRequestingReanalysis}
              className="w-full py-3 bg-text-primary text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] disabled:opacity-50 hover:bg-black transition-all shadow-lg active:scale-95"
            >
              {isRequestingReanalysis ? "REANALISANDO..." : "SOLICITAR RE-ANÁLISE"}
            </button>
          </div>

          <div className="glass-card p-5 space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70">Ferramentas utilizadas</div>
            {extractedTools.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-subtle bg-white/40 px-3 py-2 text-xs text-text-secondary">
                Ainda não há uso de ferramentas registrado nesta task.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {extractedTools.map((toolName) => {
                  const meta = TOOL_BADGE_META[toolName] ?? { icon: "🛠️", label: toolName };
                  return (
                    <span
                      key={toolName}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-2.5 py-1 text-[11px] font-semibold text-text-secondary"
                    >
                      {meta.service ? (
                        <ServiceLogo service={meta.service} className="w-4 h-4 border-none shadow-none" />
                      ) : (
                        <span>{meta.icon ?? "🛠️"}</span>
                      )}
                      <span>{meta.label}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="glass-card p-5 space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70">Subtarefas Delegadas</div>
            {delegatedSubtasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-subtle bg-white/40 px-3 py-2 text-xs text-text-secondary">
                Nenhuma subtask delegada para esta tarefa.
              </div>
            ) : (
              <div className="space-y-3">
                {delegatedSubtasks.map((subtask) => {
                  const statusMeta = subtaskStatusMeta(String(subtask.status ?? ""));
                  const assignees = (subtask.assigneeSessionKeys ?? []) as string[];
                  const assigneeLabels = assignees.map((session) => agentBySessionKey[session]?.name ?? session);
                  return (
                    <div key={subtask._id} className="rounded-2xl border border-border-subtle bg-white/70 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-text-primary leading-snug">{subtask.title}</div>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.12em] border rounded-full px-2 py-1 ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-secondary">
                        Especialista: {assigneeLabels.length > 0 ? assigneeLabels.join(", ") : "Não atribuído"}
                      </div>
                      <div className="text-[10px] font-mono text-text-secondary/60">
                        {formatLocalizedDateTime(subtask.createdAt, language)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary/70 px-2">{t("kanban.drawer.threadCommunications")}</div>
          <div className="space-y-4">
            {snapshot?.messages
              .filter((message) => !isToolBlobContent(message.content))
              .map((message) => {
                const sessionMeta = agentBySessionKey[message.fromSessionKey];
                const displayName = sessionMeta?.name || message.fromSessionKey.split(":").pop() || "User";
                const avatarSeed = sessionMeta?.avatar || displayName;
                return (
                  <div key={message._id} className="p-5 rounded-3xl bg-warm-bg/30 border border-border-subtle group hover:border-text-primary/10 transition-colors shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full border border-border-subtle overflow-hidden bg-slate-100 p-0.5">
                          <img
                            src={dicebearBotttsUrl(avatarSeed)}
                            alt={`${displayName} avatar`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-primary bg-accent-cream px-2 py-0.5 rounded shadow-sm">{displayName}</span>
                        {hasMemoryUsedMarker(message.content) ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                            {t("kanban.drawer.memory")}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-text-secondary opacity-40">
                        {formatLocalizedTime(message.createdAt, language)}
                      </span>
                    </div>
                    <div className="text-sm leading-relaxed text-text-primary/90">{stripMemoryUsedMarker(message.content)}</div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary/70 px-2">{t("kanban.drawer.docs")}</div>
          {!docs ? (
            <div className="p-4 rounded-2xl border border-border-subtle bg-white/40 text-xs text-text-secondary">
              {t("kanban.drawer.loadingDocs")}
            </div>
          ) : docs.length === 0 ? (
            <div className="p-4 rounded-2xl border border-dashed border-border-subtle bg-white/20 text-xs text-text-secondary italic">
              {t("kanban.drawer.noDocs")}
            </div>
          ) : (
            <div className="space-y-4">
              {docs.map((doc) => {
                const content = String(doc.content ?? "").trim();
                const imageDoc = isImageDocumentUrl(content);
                return (
                  <div key={doc._id} className="p-4 rounded-2xl border border-border-subtle bg-white/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-text-primary">{doc.title}</div>
                      <div className="text-[10px] font-mono text-text-secondary opacity-60">
                        {formatLocalizedDateTime(doc.createdAt, language)}
                      </div>
                    </div>
                    {imageDoc ? (
                      <div className="space-y-2">
                        <img
                          src={content}
                          alt={doc.title}
                          className="w-full rounded-xl border border-border-subtle bg-white"
                        />
                        <a
                          href={content}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-mono text-blue-700 underline break-all"
                        >
                          {content}
                        </a>
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap text-xs text-text-primary/90 font-mono">{content}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="p-8 border-t border-border-subtle bg-white/80 backdrop-blur-md">
        <form onSubmit={(event) => { void onSend(event); }} className="flex gap-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("kanban.drawer.inputPlaceholder")}
            className="flex-1 bg-warm-bg border border-border-subtle rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 transition-all shadow-inner"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-text-primary text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-black transition-all shadow-md active:scale-90"
          >
            {t("kanban.drawer.transmit")}
          </button>
        </form>
      </div>
    </div>
  );
}
