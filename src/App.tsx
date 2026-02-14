import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

import { UxStateView } from "./UxStateView";
import { UX_STATES } from "./uxContract";
import { useUxFlowControllerInstrumented } from "./useUxFlowController.instrumented";
import { makeConvexEmitter, ingestMutationRef } from "./convexEmitter";
import { OrgProvider } from "./OrgContext";

import { DeptProvider, useDept } from "./DeptContext";
import DeptSwitcher from "./components/DeptSwitcher";
import { SignIn } from "./components/SignIn";
import AgentStore from "./components/AgentStore";
import OrgSettings from "./components/OrgSettings";
import CreateTaskModal from "./components/CreateTaskModal";
import CreateDeptModal from "./components/CreateDeptModal";
import CreateOrgModal from "./components/CreateOrgModal";
import EditNameModal from "./components/EditNameModal";
import DeleteConfirmModal from "./components/DeleteConfirmModal";
import DropdownMenu from "./components/DropdownMenu";
import { AgentSidebar } from "./components/AgentSidebar";
import { TopNav } from "./components/TopNav";
import { LiveActivityFeed } from "./components/LiveActivityFeed";
import { TaskHistoryTimeline } from "./components/TaskHistoryTimeline";
import OrgSwitcher from "./components/OrgSwitcher";
import { useOrg } from "./OrgContext";
import { dicebearBotttsUrl } from "./lib/avatar";
import KnowledgeBase from "./components/KnowledgeBase";
import { UpgradeModal } from "./components/UpgradeModal";
import GitHubCredentialDoc from "./pages/docs/GitHubCredentialDoc";
import { LandingPage } from "./pages/LandingPage";
import { navigate, usePathname } from "./lib/router";
import type { OrgSettingsTab } from "./components/OrgSettings";
import { formatLocalizedDateTime, formatLocalizedTime, formatRelativeTimeFromNow } from "./lib/i18nTime";
import { UPGRADE_MODAL_EVENT, type UpgradeModalDetail } from "./lib/upgradeModal";

const PENDING_INVITE_TOKEN_KEY = "mission-control-pending-invite-token";

type Status =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done";

const COLUMNS: Status[] = ["inbox", "assigned", "in_progress", "review", "done"];

const PRIORITY_COLOR: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-blue-500",
};

const STATUS_COLOR: Record<Status, string> = {
  inbox: "bg-amber-400",
  assigned: "bg-blue-400",
  in_progress: "bg-emerald-400",
  review: "bg-indigo-400",
  done: "bg-gray-400",
};

const STATUS_UPDATE_OPTIONS: Array<{ value: Status; disabled?: boolean }> = [
  { value: "inbox" },
  { value: "assigned" },
  { value: "in_progress" },
  { value: "review" },
  { value: "done", disabled: true },
];

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

function TaskCard({
  task,
  onClick,
  agentBySessionKey,
  onDelete,
}: {
  task: any,
  onClick: () => void;
  agentBySessionKey: Record<string, { name: string; avatar?: string }>;
  onDelete: (task: any) => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "pt";
  const priority = (task.priority as string) || "medium";
  const timeAgo = formatRelativeTimeFromNow(task._creationTime || task.createdAt || Date.now(), language);
  const primarySessionKey = task.assigneeSessionKeys?.[0];
  const primaryAgent = primarySessionKey ? agentBySessionKey[primarySessionKey] : undefined;
  const primaryAgentName = primaryAgent?.name ?? t("kanban.taskCard.unassigned");
  const primaryAgentAvatarSeed = primaryAgent?.avatar || primaryAgentName;
  const ownerName = (task.ownerName as string | undefined)?.trim() || t("kanban.taskCard.unknownOwner");

  return (
    <div
      onClick={onClick}
      className="group relative flex bg-white rounded-xl border border-border-subtle shadow-sm hover:shadow-md hover:border-text-primary/10 transition-all cursor-pointer overflow-hidden"
    >
      {/* Priority Strip */}
      <div className={`w-1 flex-shrink-0 ${PRIORITY_COLOR[priority] || "bg-amber-500"}`} />

      <div className="flex-1 p-4 flex flex-col min-w-0">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task);
          }}
          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-all"
          title="Delete task"
          aria-label="Delete task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>

        <div className="text-sm font-bold leading-snug group-hover:text-black transition-colors mb-2">
          {task.title}
        </div>
        <div className="text-[10px] font-mono text-text-secondary/80 mb-2 truncate" title={`${t("kanban.taskCard.owner")}: ${ownerName}`}>
          {t("kanban.taskCard.owner")}: {ownerName}
        </div>

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {task.tags.map((tag: string) => (
              <span key={tag} className="px-1.5 py-0.5 rounded-md bg-accent-cream text-[9px] font-bold text-text-secondary uppercase tracking-tighter">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-[10px] text-text-secondary opacity-60 font-medium">
              {timeAgo}
            </div>
            <div className="w-5 h-5 rounded-full bg-white border border-border-subtle overflow-hidden p-0.5">
              <img
                src={dicebearBotttsUrl(primaryAgentAvatarSeed)}
                alt={`${primaryAgentName} avatar`}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-[10px] font-mono font-semibold text-text-secondary truncate max-w-[86px]" title={primaryAgentName}>
              {primaryAgentName}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* ID */}
            <div className="text-[10px] font-mono text-text-secondary opacity-40">
              #{task._id.toString().slice(-4)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({
  status,
  title,
  onOpenTask,
  onAddTask, // [NEW]
  onDeleteTask,
  onCleanDone,
  isCleaningDone = false,
}: {
  status: Status;
  title: string;
  onOpenTask: (taskId: Id<"tasks">) => void;
  onAddTask?: () => void; // [NEW]
  onDeleteTask: (task: any) => void;
  onCleanDone?: () => void;
  isCleaningDone?: boolean;
}) {
  const { t } = useTranslation();
  const { activeDeptId } = useDept();
  const agents = useQuery(api.agents.listByDept, activeDeptId ? { departmentId: activeDeptId } : "skip");
  const tasks = useQuery(api.tasks.listByStatus, activeDeptId ? {
    departmentId: activeDeptId,
    status,
    limit: 50,
  } : "skip");
  const visibleTasks = useMemo(
    () =>
      (tasks ?? []).filter((t: any) => {
        const normalizedStatus = String(t.status).toLowerCase();
        return normalizedStatus === status || (status === "in_progress" && normalizedStatus === "blocked");
      }),
    [tasks, status]
  );
  const agentBySessionKey = useMemo(() => {
    const map: Record<string, { name: string; avatar?: string }> = {};
    for (const agent of agents ?? []) {
      map[agent.sessionKey] = { name: agent.name, avatar: (agent as any).avatar };
    }
    return map;
  }, [agents]);

  const count = visibleTasks.length;

  return (
    <section className="w-80 flex-shrink-0 flex flex-col max-h-full">
      <div className="flex justify-between items-center mb-5 px-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${STATUS_COLOR[status]}`} />
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary">
            {t(`kanban.columns.${status}`, { defaultValue: title })}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {onAddTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddTask();
              }}
              className="p-1 hover:bg-black/5 rounded text-text-secondary transition-colors"
              title={t("kanban.newTask")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          )}
          {status === "done" && onCleanDone && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCleanDone();
              }}
              disabled={isCleaningDone || count === 0}
              className="px-2 py-1 rounded-md border border-border-subtle bg-white text-[10px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary hover:border-text-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t("kanban.cleanDoneTitle")}
            >
              {isCleaningDone ? t("kanban.cleaning") : t("kanban.clean")}
            </button>
          )}
          <span className="bg-white border border-border-subtle px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold text-text-secondary shadow-sm">
            {count}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin pb-10">
        {!tasks ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(_ => <div key={_} className="h-28 bg-white/40 rounded-2xl border border-border-subtle" />)}
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="p-12 rounded-2xl border border-dashed border-border-subtle text-xs text-center text-text-secondary italic bg-white/10">
            {t("kanban.emptyColumn")}
          </div>
        ) : (
          visibleTasks.map((t: any) => (
            <TaskCard
              key={t._id}
              task={t}
              agentBySessionKey={agentBySessionKey}
              onDelete={onDeleteTask}
              onClick={() => onOpenTask(t._id)}
            />
          ))
        )}
      </div>
    </section >
  );
}

export default function App() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [isProbablyMobile, setIsProbablyMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 48rem) and (hover: none) and (pointer: coarse)").matches;
  });
  const normalizedPath = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const pathInviteToken =
    normalizedPath.startsWith("/join/")
      ? normalizedPath.replace("/join/", "").trim()
      : "";
  const storedInviteToken =
    typeof window !== "undefined"
      ? (window.localStorage.getItem(PENDING_INVITE_TOKEN_KEY) || "").trim()
      : "";
  const inviteToken = pathInviteToken || storedInviteToken;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 48rem) and (hover: none) and (pointer: coarse)");
    const update = () => setIsProbablyMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const isJoinRoute = normalizedPath.startsWith("/join/") || Boolean(inviteToken);
    const isDocsRoute = normalizedPath === "/docs/credentials/github";
    const isAuthRoute = normalizedPath === "/login" || normalizedPath === "/signup";
    const isSettingsRoute = normalizedPath === "/settings";
    if (isJoinRoute || isDocsRoute) return;
    if (isAuthenticated && normalizedPath !== "/dashboard" && !isSettingsRoute) {
      navigate("/dashboard", { replace: true });
    }
    if (!isAuthenticated && (normalizedPath === "/dashboard" || isSettingsRoute)) {
      navigate("/", { replace: true });
    }
    if (!isAuthenticated && !isAuthRoute && normalizedPath !== "/") {
      navigate("/", { replace: true });
    }
  }, [isLoading, isAuthenticated, normalizedPath, inviteToken]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-bg flex items-center justify-center text-sm text-text-secondary">
        {t("app.loadingSession")}
      </div>
    );
  }

  if (normalizedPath === "/docs/credentials/github") {
    return <GitHubCredentialDoc />;
  }

  if (normalizedPath.startsWith("/join/") || inviteToken) {
    return (
      isAuthenticated ? (
        <OrgProvider>
          <JoinInvitePage token={inviteToken} />
        </OrgProvider>
      ) : (
        <JoinInviteSignIn token={inviteToken} />
      )
    );
  }

  if (isAuthenticated) {
    return (
      <>
        {isProbablyMobile ? (
          <div className="fixed inset-0 z-[100] bg-warm-bg flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 bg-accent-cream rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <span className="text-2xl font-bold">MC</span>
            </div>
            <h2 className="text-xl font-bold mb-2">{t("app.desktopRequired")}</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {t("app.desktopRequiredDesc")}
            </p>
          </div>
        ) : null}
        <OrgProvider>
          <DeptProvider>
            <div className="dashboard-shell flex flex-col h-screen bg-warm-bg overflow-hidden text-text-primary">
              <TopNav />
              <MainDashboard initialView={normalizedPath === "/settings" ? "settings" : "dashboard"} />
            </div>
          </DeptProvider>
        </OrgProvider>
      </>
    );
  }

  if (normalizedPath === "/signup") {
    return <SignIn initialMode="signUp" />;
  }

  if (normalizedPath === "/login") {
    return <SignIn />;
  }

  return <LandingPage />;
}

function MainDashboard({ initialView }: { initialView: "dashboard" | "settings" }) {
  const { t } = useTranslation();
  const { activeDeptId, departments, setActiveDeptId } = useDept();
  const { activeOrgId, organizations, setActiveOrgId } = useOrg();
  const [view, setView] = useState<"dashboard" | "store" | "docs" | "knowledge" | "settings">(initialView);
  const [settingsTab, setSettingsTab] = useState<OrgSettingsTab>("integrations");
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [isCreateDeptModalOpen, setIsCreateDeptModalOpen] = useState(false);
  const [isEditOrgModalOpen, setIsEditOrgModalOpen] = useState(false);
  const [isDeleteOrgModalOpen, setIsDeleteOrgModalOpen] = useState(false);
  const [isEditDeptModalOpen, setIsEditDeptModalOpen] = useState(false);
  const [isDeleteDeptModalOpen, setIsDeleteDeptModalOpen] = useState(false);
  const [upgradeModalDetail, setUpgradeModalDetail] = useState<UpgradeModalDetail | null>(null);
  const activeOrg = organizations?.find((o) => o._id === activeOrgId);
  const activeDept = departments?.find((d) => d._id === activeDeptId);
  const canManage = activeOrg?.role === "owner" || activeOrg?.role === "admin";
  const renameOrg = useMutation((api as any).organizations.updateName);
  const deleteOrg = useMutation((api as any).organizations.remove);
  const renameDept = useMutation((api as any).departments.updateName);
  const deleteDept = useMutation((api as any).departments.remove);
  const menuItems: Array<{
    key: "dashboard" | "store" | "docs" | "knowledge" | "settings";
    label: string;
    emoji: string;
  }> = [
      { key: "dashboard", label: t("views.operations"), emoji: "⚙️" },
      { key: "store", label: t("views.agentStore"), emoji: "🧩" },
      { key: "docs", label: t("views.docs"), emoji: "📄" },
      { key: "knowledge", label: t("views.knowledgeBase"), emoji: "🧠" },
      { key: "settings", label: t("views.settings"), emoji: "🔐" },
    ];

  useEffect(() => {
    const openTeam = () => {
      setView("settings");
      setSettingsTab("team");
    };
    const openBilling = () => {
      setView("settings");
      setSettingsTab("billing");
    };

    window.addEventListener("mc:open-team-members", openTeam as EventListener);
    window.addEventListener("mc:open-billing-plan", openBilling as EventListener);
    return () => {
      window.removeEventListener("mc:open-team-members", openTeam as EventListener);
      window.removeEventListener("mc:open-billing-plan", openBilling as EventListener);
    };
  }, []);

  useEffect(() => {
    const openUpgradeModal = (event: Event) => {
      const customEvent = event as CustomEvent<UpgradeModalDetail>;
      if (!customEvent.detail) return;
      setUpgradeModalDetail(customEvent.detail);
    };
    window.addEventListener(UPGRADE_MODAL_EVENT, openUpgradeModal as EventListener);
    return () => {
      window.removeEventListener(UPGRADE_MODAL_EVENT, openUpgradeModal as EventListener);
    };
  }, []);

  useEffect(() => {
    if (initialView === "settings") {
      setView("settings");
      setSettingsTab("integrations");
    }
  }, [initialView]);

  if (!activeDeptId) {
    return (
      <div className="flex flex-1 items-center justify-center p-20 text-center">
        <div className="space-y-6">
          <h2 className="text-xl font-bold font-mono uppercase tracking-widest text-text-secondary">{t("app.plugAndPlayReady")}</h2>
          <p className="text-sm text-text-secondary">
            {departments && departments.length > 0
              ? t("app.selectDepartment")
              : t("app.noDepartment")}
          </p>
          {departments && departments.length > 0 ? (
            <div className="inline-flex items-center justify-center">
              <DeptSwitcher />
            </div>
          ) : canManage ? (
            <button
              onClick={() => setIsCreateDeptModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-text-primary text-white text-sm font-bold uppercase tracking-wide hover:bg-black transition-colors"
            >
              {t("app.createDepartment")}
            </button>
          ) : (
            <p className="text-xs text-text-secondary/80">
              {t("app.onlyAdminsCanCreateDepartment")}
            </p>
          )}
        </div>
        <CreateDeptModal
          isOpen={isCreateDeptModalOpen}
          onClose={() => setIsCreateDeptModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* View Switcher Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#E9E9E7] bg-[#FCFCFB]">
        <div className="flex items-center gap-0.5">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setView(item.key);
                if (item.key === "settings") {
                  setSettingsTab("integrations");
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 border-b-2 text-[14px] font-medium tracking-tight transition-colors ${view === item.key
                ? "border-[#191919] text-[#191919]"
                : "border-transparent text-[#787774] hover:text-[#37352F]"
                }`}
            >
              <span className="text-[13px] leading-none" aria-hidden="true">
                {item.emoji}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <OrgSwitcher />
          {canManage && (
            <>
              <button
                onClick={() => setIsCreateOrgModalOpen(true)}
                className="p-1.5 hover:bg-black/5 rounded-full transition-all"
                title={t("common.create")}
                aria-label={t("common.create")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <DropdownMenu
                ariaLabel="Organization actions"
                items={[
                  { label: "Rename Organization", onClick: () => setIsEditOrgModalOpen(true) },
                  { label: "Delete Organization", onClick: () => setIsDeleteOrgModalOpen(true), danger: true },
                ]}
              />
            </>
          )}
          <div className="h-4 w-px bg-border-subtle" />
          <DeptSwitcher />
          {canManage && (
            <>
              <button
                onClick={() => setIsCreateDeptModalOpen(true)}
                className="p-1.5 hover:bg-black/5 rounded-full transition-all"
                title={t("app.createDepartment")}
                aria-label={t("app.createDepartment")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <DropdownMenu
                ariaLabel="Department actions"
                items={[
                  { label: "Rename Department", onClick: () => setIsEditDeptModalOpen(true) },
                  { label: "Delete Department", onClick: () => setIsDeleteDeptModalOpen(true), danger: true },
                ]}
              />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {view === "dashboard" ? (
          <>
            {/* Left Sidebar: Agents */}
            <aside className="w-64 flex-shrink-0 border-r border-border-subtle bg-white/30 overflow-y-auto pt-6 scrollbar-thin">
              <div className="px-4 mb-6">
                <button
                  type="button"
                  onClick={() => setIsCreateTaskModalOpen(true)}
                  className="w-full rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/50 px-5 py-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                    <div className="flex items-center gap-2">
                      <span role="img" aria-label="Sparkles" className="text-xl leading-none">✨</span>
                      {t("kanban.newTask")}
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </div>
                </button>
              </div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70 mb-6 px-6">{t("sidebar.mySuperTeam")}</h2>
              <AgentSidebar />
            </aside>
            <MainAppContent />
          </>
        ) : view === "store" ? (
          <div className="flex-1 overflow-y-auto bg-warm-bg/20">
            <AgentStore />
          </div>
        ) : view === "docs" ? (
          <div className="flex-1 overflow-y-auto bg-warm-bg/20">
            <GlobalDocsView />
          </div>
        ) : view === "knowledge" ? (
          <div className="flex-1 overflow-y-auto bg-warm-bg/20">
            <KnowledgeBase />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto bg-warm-bg/20">
            <OrgSettings tab={settingsTab} />
          </div>
        )}
      </div>

      <CreateDeptModal
        isOpen={isCreateDeptModalOpen}
        onClose={() => setIsCreateDeptModalOpen(false)}
      />
      <CreateOrgModal
        isOpen={isCreateOrgModalOpen}
        onClose={() => setIsCreateOrgModalOpen(false)}
      />
      <EditNameModal
        isOpen={isEditOrgModalOpen}
        onClose={() => setIsEditOrgModalOpen(false)}
        title="Rename Organization"
        label="Organization Name"
        currentName={activeOrg?.name ?? ""}
        onSubmit={async (nextName) => {
          if (!activeOrgId) return;
          await renameOrg({ orgId: activeOrgId, name: nextName });
        }}
      />
      <DeleteConfirmModal
        isOpen={isDeleteOrgModalOpen}
        onClose={() => setIsDeleteOrgModalOpen(false)}
        title="Delete Organization"
        entityName={activeOrg?.name ?? ""}
        helperText="Danger zone: this will cascade-delete all departments and their data in this organization."
        onConfirm={async () => {
          if (!activeOrgId) return;
          await deleteOrg({ orgId: activeOrgId });
          const remaining = (organizations ?? []).filter((o) => o._id !== activeOrgId);
          setActiveOrgId(remaining[0]?._id ?? null);
        }}
      />
      <EditNameModal
        isOpen={isEditDeptModalOpen}
        onClose={() => setIsEditDeptModalOpen(false)}
        title="Rename Department"
        label="Department Name"
        currentName={activeDept?.name ?? ""}
        onSubmit={async (nextName) => {
          if (!activeDeptId) return;
          await renameDept({ departmentId: activeDeptId, name: nextName });
        }}
      />
      <DeleteConfirmModal
        isOpen={isDeleteDeptModalOpen}
        onClose={() => setIsDeleteDeptModalOpen(false)}
        title="Delete Department"
        entityName={activeDept?.name ?? ""}
        helperText="This action removes department data tied to this workspace."
        onConfirm={async () => {
          if (!activeDeptId) return;
          await deleteDept({ departmentId: activeDeptId });
          const remaining = (departments ?? []).filter((d) => d._id !== activeDeptId);
          setActiveDeptId(remaining[0]?._id ?? null);
        }}
      />
      {activeDeptId && isCreateTaskModalOpen && (
        <CreateTaskModal
          isOpen={isCreateTaskModalOpen}
          onClose={() => setIsCreateTaskModalOpen(false)}
          departmentId={activeDeptId}
        />
      )}
      <UpgradeModal
        isOpen={upgradeModalDetail !== null}
        planId={upgradeModalDetail?.planId ?? null}
        onClose={() => setUpgradeModalDetail(null)}
        onGoToBilling={() => {
          setUpgradeModalDetail(null);
          setView("settings");
          setSettingsTab("billing");
        }}
      />
    </div>
  );
}

function GlobalDocsView() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "pt";
  const { activeDeptId } = useDept();
  const docs = useQuery(
    api.documents.listByDepartment,
    activeDeptId ? { departmentId: activeDeptId, limit: 200 } : "skip"
  );

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("app.globalDocs")}</h2>
        <p className="text-sm text-text-secondary">{t("app.globalDocsDesc")}</p>
      </div>

      {!docs ? (
        <div className="p-6 rounded-2xl border border-border-subtle bg-white/60 text-sm text-text-secondary">
          {t("app.loadingDocuments")}
        </div>
      ) : docs.length === 0 ? (
        <div className="p-6 rounded-2xl border border-dashed border-border-subtle bg-white/30 text-sm text-text-secondary italic">
          {t("app.noDocuments")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc: any) => {
            const content = String(doc.content ?? "").trim();
            const imageDoc = isImageDocumentUrl(content);
            return (
              <div key={doc._id} className="rounded-2xl border border-border-subtle bg-white/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-bold text-text-primary truncate">{doc.title}</div>
                  <div className="text-[10px] font-mono text-text-secondary opacity-60 whitespace-nowrap">
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
  );
}

function JoinInviteSignIn({ token }: { token: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const trimmed = token.trim();
    if (!trimmed) return;
    window.localStorage.setItem(PENDING_INVITE_TOKEN_KEY, trimmed);
  }, [token]);

  return (
    <div className="fixed inset-0 bg-warm-bg overflow-y-auto">
      <div className="min-h-full flex items-start sm:items-center justify-center px-6 py-8">
        <div className="w-full max-w-2xl space-y-6">
          <div className="max-w-xl mx-auto text-center space-y-3">
            <h1 className="text-2xl font-bold">Accept Invitation</h1>
            <p className="text-sm text-text-secondary">
              Create your account or sign in to accept your invite token.
            </p>
            <p className="text-[11px] font-mono opacity-50 break-all">{token}</p>
            <p className="text-xs text-text-secondary">
              Don&apos;t have an account? Use <span className="font-semibold">Start the free trial</span> below.
            </p>
          </div>
          <SignIn embedded initialMode="signUp" />
        </div>
      </div>
    </div>
  );
}

function JoinInvitePage({ token }: { token: string }) {
  const validation = useQuery(api.invites.validate, { token });
  const acceptInvite = useMutation(api.invites.accept);
  const { setActiveOrgId } = useOrg();
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptedOrgName, setAcceptedOrgName] = useState<string | null>(null);
  const [hasAttemptedAutoAccept, setHasAttemptedAutoAccept] = useState(false);
  const inviteAlreadyAccepted =
    validation !== undefined &&
    !validation.valid &&
    String(validation.reason || "").toLowerCase().includes("accepted");

  const onAccept = async () => {
    try {
      setIsAccepting(true);
      const result = await acceptInvite({ token });
      setActiveOrgId(result.orgId);
      setAcceptedOrgName(validation?.orgName || "Organization");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
      }
    } catch (err: any) {
      window.alert(`Could not accept invite: ${err.message}`);
    } finally {
      setIsAccepting(false);
    }
  };

  useEffect(() => {
    if (validation === undefined) return;
    if (!validation.valid) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
      }
      return;
    }
    if (hasAttemptedAutoAccept || isAccepting || acceptedOrgName) return;
    setHasAttemptedAutoAccept(true);
    void onAccept();
  }, [validation, hasAttemptedAutoAccept, isAccepting, acceptedOrgName]);

  useEffect(() => {
    if (!inviteAlreadyAccepted) return;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
    }
  }, [inviteAlreadyAccepted]);

  useEffect(() => {
    if (!acceptedOrgName && !inviteAlreadyAccepted) return;
    navigate("/dashboard", { replace: true });
  }, [acceptedOrgName, inviteAlreadyAccepted]);

  return (
    <div className="min-h-screen bg-warm-bg flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white border border-border-subtle rounded-2xl p-8 space-y-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Join Organization</h1>
          <p className="text-sm text-text-secondary break-all">
            Invite token: <span className="font-mono">{token}</span>
          </p>
        </div>

        {validation === undefined ? (
          <p className="text-sm">Validating invitation...</p>
        ) : !validation.valid ? (
          inviteAlreadyAccepted ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                Invitation already accepted for this account.
              </div>
              <button
                onClick={() => {
                  navigate("/", { replace: true });
                }}
                className="w-full px-4 py-2 rounded-lg bg-text-primary text-white text-sm font-bold uppercase tracking-wider"
              >
                Open Dashboard
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              Invitation is not valid: {validation.reason}
            </div>
          )
        ) : isAccepting ? (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700">
            Joining <span className="font-bold">{validation.orgName}</span>...
          </div>
        ) : acceptedOrgName ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
              You joined {acceptedOrgName} successfully.
            </div>
            <button
              onClick={() => {
                navigate("/", { replace: true });
              }}
              className="w-full px-4 py-2 rounded-lg bg-text-primary text-white text-sm font-bold uppercase tracking-wider"
            >
              Open Dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700">
              You are invited to join <span className="font-bold">{validation.orgName}</span>.
            </div>
            <button
              onClick={() => { void onAccept(); }}
              disabled={isAccepting}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {isAccepting ? "Accepting..." : "Accept Invitation"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MainAppContent() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "pt";
  const { activeDeptId } = useDept();
  const sessionKey = "agent:main:main";
  const agents = useQuery(api.agents.listByDept, activeDeptId ? { departmentId: activeDeptId } : "skip");
  const [operationsView, setOperationsView] = useState<"board" | "history">("board");

  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [draft, setDraft] = useState("");

  const [statusDraft, setStatusDraft] = useState<Status>("assigned");
  const [statusBusy, setStatusBusy] = useState(false);

  const snapshot = useQuery(
    api.tasks.getThreadSnapshot,
    selectedTaskId ? { taskId: selectedTaskId, limit: 50 } : "skip"
  );
  const docs = useQuery(
    api.documents.listByTask,
    selectedTaskId ? { taskId: selectedTaskId, limit: 20 } : "skip"
  );
  const agentBySessionKey = useMemo(() => {
    const map: Record<string, { name: string; avatar?: string }> = {};
    for (const agent of agents ?? []) {
      map[agent.sessionKey] = { name: agent.name, avatar: (agent as any).avatar };
    }
    return map;
  }, [agents]);

  const createMessage = useMutation(api.messages.create);
  const setStatus = useMutation(api.tasks.setStatus);
  const approveTask = useMutation((api as any).tasks.approve);

  const ingestUxEvent = useMutation(ingestMutationRef);
  const uxEmitter = useMemo(() => makeConvexEmitter(ingestUxEvent), [ingestUxEvent]);

  const runForTask = useMutation(api.uxFlows.runForTask);
  const unblockTask = useMutation(api.tasks.unblock);
  const deleteTask = useMutation((api as any).tasks.remove);
  const clearDoneColumn = useMutation((api as any).tasks.clearDoneColumn);

  const [isActivityOpen, setIsActivityOpen] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isCleaningDoneColumn, setIsCleaningDoneColumn] = useState(false);

  useEffect(() => {
    const s = snapshot?.task?.status;
    if (s) setStatusDraft(normalizeUiTaskStatus(s));
  }, [snapshot?.task?._id, snapshot?.task?.status]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedTaskId || !activeDeptId) return;

    const content = draft.trim();
    if (!content) return;

    await createMessage({
      departmentId: activeDeptId,
      taskId: selectedTaskId,
      fromSessionKey: sessionKey,
      content,
    });

    setDraft("");
  }

  async function onSaveStatus() {
    if (!selectedTaskId || !activeDeptId) return;
    if (statusDraft === "done") {
      window.alert(t("app.statusDoneAlert"));
      return;
    }
    setStatusBusy(true);
    try {
      await setStatus({
        departmentId: activeDeptId,
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
    if (!selectedTaskId || !activeDeptId) return;
    setIsApproving(true);
    try {
      await approveTask({
        departmentId: activeDeptId,
        taskId: selectedTaskId,
      });
      setStatusDraft("done");
    } catch (error: any) {
      window.alert(error?.message || t("app.approveError"));
    } finally {
      setIsApproving(false);
    }
  }

  const run = useCallback(() => {
    if (!selectedTaskId || !activeDeptId) {
      return Promise.resolve({ ok: false as const, reason: "failed" as const });
    }
    return runForTask({ departmentId: activeDeptId, taskId: selectedTaskId, sessionKey });
  }, [runForTask, selectedTaskId, sessionKey, activeDeptId]);

  const { state: uxState, isLocked: uxLocked, triggerAction, resolveAttention } =
    useUxFlowControllerInstrumented(run, {
      emitter: uxEmitter,
      flowId: selectedTaskId ? selectedTaskId.toString() : "no-task",
      userId: sessionKey,
    });

  const onResolveAttention = useCallback(async () => {
    if (!selectedTaskId || !activeDeptId) return;

    await unblockTask({
      departmentId: activeDeptId,
      taskId: selectedTaskId,
      sessionKey,
      nextStatus: "in_progress",
    });

    resolveAttention();
  }, [selectedTaskId, activeDeptId, unblockTask, resolveAttention, sessionKey]);

  const isAttention = uxState === UX_STATES.ATENCAO_NECESSARIA;
  const onDeleteTask = useCallback(async (task: any) => {
    if (!activeDeptId) return;
    const confirmed = window.confirm(t("app.confirmDeleteTask", { title: task.title }));
    if (!confirmed) return;

    await deleteTask({
      departmentId: activeDeptId,
      taskId: task._id,
      bySessionKey: sessionKey,
    });

    if (selectedTaskId === task._id) {
      setSelectedTaskId(null);
    }
  }, [activeDeptId, deleteTask, selectedTaskId, sessionKey, t]);

  const onCleanDoneColumn = useCallback(async () => {
    if (!activeDeptId || isCleaningDoneColumn) return;
    const confirmed = window.confirm(t("kanban.confirmCleanDone"));
    if (!confirmed) return;

    setIsCleaningDoneColumn(true);
    try {
      await clearDoneColumn({
        departmentId: activeDeptId,
        bySessionKey: sessionKey,
      });
    } finally {
      setIsCleaningDoneColumn(false);
    }
  }, [activeDeptId, clearDoneColumn, isCleaningDoneColumn, sessionKey, t]);

  return (
    <>
      {/* Center: Kanban Board */}
      <main className="flex-1 flex flex-col overflow-hidden bg-warm-bg/30">
        <div className="px-8 pt-6 pb-2 flex items-center justify-between gap-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70">
            {t("kanban.taskView")}
          </div>
          <div className="inline-flex rounded-xl border border-border-subtle bg-white p-1">
            <button
              type="button"
              onClick={() => setOperationsView("board")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${operationsView === "board"
                ? "bg-text-primary text-white"
                : "text-text-secondary hover:text-text-primary"
                }`}
            >
              {t("views.board")}
            </button>
            <button
              type="button"
              onClick={() => setOperationsView("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${operationsView === "history"
                ? "bg-text-primary text-white"
                : "text-text-secondary hover:text-text-primary"
                }`}
            >
              {t("views.history")}
            </button>
          </div>
        </div>

        {operationsView === "board" ? (
          <div className="flex-1 overflow-x-auto p-8 pt-4 scrollbar-thin">
            <div className="flex gap-6 h-full min-w-max">
              {COLUMNS.map((c) => (
                <Column
                  key={c}
                  status={c}
                  title={t(`kanban.columns.${c}`)}
                  onOpenTask={(id) => setSelectedTaskId(id)}
                  onDeleteTask={onDeleteTask}
                  onCleanDone={c === "done" ? onCleanDoneColumn : undefined}
                  isCleaningDone={c === "done" ? isCleaningDoneColumn : false}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 pt-4 scrollbar-thin">
            {activeDeptId ? (
              <TaskHistoryTimeline
                departmentId={activeDeptId}
                onOpenTask={(id) => setSelectedTaskId(id)}
              />
            ) : null}
          </div>
        )}
      </main>

      {/* Right Sidebar: Live Activity Feed */}
      <aside
        className={`${isActivityOpen ? "w-80" : "w-12"} flex-shrink-0 border-l border-border-subtle bg-white/30 flex flex-col overflow-hidden transition-all duration-200`}
      >
        <div className={`border-b border-border-subtle bg-white/50 ${isActivityOpen ? "p-4" : "p-2"} flex items-center justify-between`}>
          {isActivityOpen && (
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70 px-2">
              {t("kanban.drawer.globalActivity")}
            </h2>
          )}
          <button
            type="button"
            onClick={() => setIsActivityOpen((prev) => !prev)}
            className="p-1.5 rounded-md hover:bg-black/5 text-text-secondary transition-colors"
            title={isActivityOpen ? t("kanban.drawer.closeActivity") : t("kanban.drawer.openActivity")}
            aria-label={isActivityOpen ? t("kanban.drawer.closeActivity") : t("kanban.drawer.openActivity")}
          >
            {isActivityOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            )}
          </button>
        </div>
        {isActivityOpen ? <LiveActivityFeed /> : null}
      </aside>

      {/* Task Inspection Drawer */}
      {selectedTaskId && (
        <div className="fixed inset-y-0 right-0 w-[520px] bg-white shadow-2xl border-l border-border-subtle z-50 flex flex-col transform transition-transform animate-in slide-in-from-right duration-300">
          <div className="p-8 border-b border-border-subtle flex items-center justify-between bg-white/50 backdrop-blur-sm">
            <div className="min-w-0">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary opacity-60">{t("kanban.drawer.title")}</h3>
              <div className="truncate text-xl font-bold mt-1 text-text-primary">
                {snapshot?.task?.title || t("kanban.drawer.syncing")}
              </div>
            </div>
            <button
              onClick={() => setSelectedTaskId(null)}
              className="p-2 hover:bg-black/5 rounded-xl transition-all text-text-secondary"
            >
              <span className="text-xs font-bold uppercase tracking-tighter">{t("common.close")}</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin">
            <div className="grid grid-cols-1 gap-6">
              {/* Status Control */}
              <div className="glass-card p-5 space-y-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70">{t("kanban.drawer.lifecycleStatus")}</div>
                <div className="flex gap-3">
                  <select
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(normalizeUiTaskStatus(e.target.value))}
                    className="flex-1 bg-white border border-border-subtle rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all shadow-sm"
                  >
                    {STATUS_UPDATE_OPTIONS.map(({ value, disabled }) => (
                      <option key={value} value={value} disabled={disabled}>
                        {value === "done"
                          ? `${t(`status.${value}`)} (${t("kanban.drawer.approvalOnly")})`
                          : t(`status.${value}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={onSaveStatus}
                    disabled={statusBusy}
                    className="px-6 py-2.5 bg-text-primary text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-black transition-all shadow-md active:scale-95"
                  >
                    {t("common.update")}
                  </button>
                </div>
                {normalizeUiTaskStatus(snapshot?.task?.status) === "review" && (
                  <button
                    onClick={() => { void onApproveTask(); }}
                    disabled={isApproving}
                    className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-emerald-700 transition-all shadow-md"
                  >
                    {isApproving ? t("kanban.drawer.approving") : t("kanban.drawer.approve")}
                  </button>
                )}
              </div>

              {/* UX Flow Control */}
              <div className="glass-card p-5 space-y-5">
                <div className="flex justify-between items-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70">{t("kanban.drawer.flowExecutionProfile")}</div>
                  <div className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">
                    TXN_{selectedTaskId.toString().slice(-6)}
                  </div>
                </div>

                <UxStateView
                  state={uxState}
                  actionLabel={isAttention ? "PROVIDE_INTEL" : undefined}
                  onAction={isAttention ? () => { void onResolveAttention(); } : undefined}
                />

                <button
                  onClick={() => { void triggerAction(); }}
                  disabled={uxLocked}
                  className="w-full py-4 bg-text-primary text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] disabled:opacity-50 hover:bg-black transition-all shadow-lg active:scale-95"
                >
                  {uxLocked ? "EXECUTING..." : "DISPATCH_FLOW"}
                </button>
              </div>
            </div>

            {/* Message Thread */}
            <div className="space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary/70 px-2">{t("kanban.drawer.threadCommunications")}</div>
              <div className="space-y-4">
                {snapshot?.messages
                  .filter((m: any) => !isToolBlobContent(m.content))
                  .map((m: any) => {
                    const sessionMeta = agentBySessionKey[m.fromSessionKey];
                    const displayName = sessionMeta?.name || m.fromSessionKey.split(":").pop() || "User";
                    const avatarSeed = sessionMeta?.avatar || displayName;
                    return (
                      <div key={m._id} className="p-5 rounded-3xl bg-warm-bg/30 border border-border-subtle group hover:border-text-primary/10 transition-colors shadow-sm">
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
                            {hasMemoryUsedMarker(m.content) && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                                {t("kanban.drawer.memory")}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono font-bold text-text-secondary opacity-40">
                            {formatLocalizedTime(m.createdAt, language)}
                          </span>
                        </div>
                        <div className="text-sm leading-relaxed text-text-primary/90">{stripMemoryUsedMarker(m.content)}</div>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Docs */}
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
                  {docs.map((doc: any) => {
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

          {/* New Message Input */}
          <div className="p-8 border-t border-border-subtle bg-white/80 backdrop-blur-md">
            <form onSubmit={(e) => { void onSend(e); }} className="flex gap-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
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
      )}

    </>
  );
}
