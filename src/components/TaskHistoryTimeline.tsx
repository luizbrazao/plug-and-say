import { useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const PAGE_SIZE = 25;

function toDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimelineDateLabel(dateKey: string): string {
  const todayKey = toDateKey(Date.now());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday.getTime());

  if (dateKey === todayKey) return "Hoje";
  if (dateKey === yesterdayKey) return "Ontem";
  return dateKey;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const datePart = date.toLocaleDateString();
  const timePart = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

function priorityClass(priority?: string): string {
  if (priority === "high") return "bg-red-100 text-red-700 border-red-200";
  if (priority === "low") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

type TaskHistoryTimelineProps = {
  departmentId: Id<"departments">;
  onOpenTask: (taskId: Id<"tasks">) => void;
};

export function TaskHistoryTimeline({ departmentId, onOpenTask }: TaskHistoryTimelineProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.tasks.listDonePaginated,
    { departmentId },
    { initialNumItems: PAGE_SIZE }
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [titleQuery, setTitleQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");

  useEffect(() => {
    if (status !== "CanLoadMore") return;
    if (!sentinelRef.current) return;

    const node = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore(PAGE_SIZE);
        }
      },
      {
        root: null,
        rootMargin: "220px 0px",
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [status, loadMore]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const task of results) {
      for (const tag of task.tags ?? []) {
        const normalizedTag = tag.trim();
        if (normalizedTag) tags.add(normalizedTag);
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [results]);

  const normalizedTitleQuery = titleQuery.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    return results.filter((task) => {
      const matchesTitle = normalizedTitleQuery.length === 0
        ? true
        : task.title.toLowerCase().includes(normalizedTitleQuery);
      const matchesTag = tagFilter === "all"
        ? true
        : (task.tags ?? []).includes(tagFilter);
      return matchesTitle && matchesTag;
    });
  }, [results, normalizedTitleQuery, tagFilter]);

  const groupedByDay = useMemo(() => {
    const groups: Array<{ key: string; label: string; tasks: typeof filteredTasks }> = [];
    const groupMap = new Map<string, { key: string; label: string; tasks: typeof filteredTasks }>();

    for (const task of filteredTasks) {
      const timestamp = task.createdAt ?? task._creationTime;
      const dateKey = toDateKey(timestamp);

      let group = groupMap.get(dateKey);
      if (!group) {
        group = {
          key: dateKey,
          label: toTimelineDateLabel(dateKey),
          tasks: [],
        };
        groupMap.set(dateKey, group);
        groups.push(group);
      }

      group.tasks.push(task);
    }

    return groups;
  }, [filteredTasks]);

  const isInitialLoading = status === "LoadingFirstPage" && results.length === 0;

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5">
      <div className="glass-card p-4 md:p-5 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={titleQuery}
            onChange={(event) => setTitleQuery(event.target.value)}
            placeholder="Buscar por título..."
            className="h-10 flex-1 rounded-xl border border-border-subtle bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          />
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="h-10 rounded-xl border border-border-subtle bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          >
            <option value="all">Todas as tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-text-secondary">
          {filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"} concluída{filteredTasks.length === 1 ? "" : "s"} exibidas
        </div>
      </div>

      {isInitialLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 rounded-2xl border border-border-subtle bg-white/70 animate-pulse" />
          ))}
        </div>
      ) : groupedByDay.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-white/40 p-10 text-center text-sm text-text-secondary">
          Nenhuma task concluída encontrada com os filtros atuais.
        </div>
      ) : (
        <div className="space-y-7">
          {groupedByDay.map((group) => (
            <div key={group.key} className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-text-secondary/80">
                {group.label}
              </h3>
              <div className="space-y-4">
                {group.tasks.map((task, index) => {
                  const timestamp = task.createdAt ?? task._creationTime;
                  const isLastInGroup = index === group.tasks.length - 1;
                  const assignees = task.assigneeSessionKeys.length > 0
                    ? task.assigneeSessionKeys.join(", ")
                    : "Unassigned";

                  return (
                    <article key={task._id} className="relative pl-8">
                      {!isLastInGroup ? (
                        <span className="absolute left-[0.7rem] top-5 bottom-[-1.1rem] w-px bg-border-subtle" />
                      ) : null}
                      <span className="absolute left-2 top-2 h-3 w-3 rounded-full border-2 border-emerald-500 bg-white" />

                      <button
                        type="button"
                        onClick={() => onOpenTask(task._id)}
                        className="w-full rounded-2xl border border-border-subtle bg-white p-4 text-left shadow-sm transition-all hover:border-text-primary/15 hover:shadow-md"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <h4 className="text-sm font-bold text-text-primary">{task.title}</h4>
                            <p
                              className="text-sm text-text-secondary"
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {task.description}
                            </p>
                          </div>
                          <div className="text-[11px] font-mono text-text-secondary/75 whitespace-nowrap">
                            {formatDateTime(timestamp)}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {task.priority ? (
                            <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase ${priorityClass(task.priority)}`}>
                              {task.priority}
                            </span>
                          ) : null}
                          {(task.tags ?? []).map((tag) => (
                            <span
                              key={`${task._id}-${tag}`}
                              className="rounded-lg bg-accent-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-tight text-text-secondary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="mt-3 text-[11px] text-text-secondary/80">
                          Assignees: {assignees}
                        </div>
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />

      {(status === "CanLoadMore" || status === "LoadingMore") ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => loadMore(PAGE_SIZE)}
            disabled={status !== "CanLoadMore"}
            className="rounded-xl border border-border-subtle bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-text-secondary transition-colors hover:bg-black/5 disabled:opacity-60"
          >
            {status === "LoadingMore" ? "Carregando..." : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

