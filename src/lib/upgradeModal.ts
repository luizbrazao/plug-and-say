import type { PaidPlanId } from "./billingPlans";

export const UPGRADE_MODAL_EVENT = "mc:open-upgrade-modal";

export type UpgradeModalDetail = {
  planId: PaidPlanId | null;
  sourceMessage: string;
};

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return String((error as { message: string }).message);
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

function inferUpgradePlanFromMessage(message: string): PaidPlanId | null {
  const normalized = message.toLowerCase();
  if (normalized.includes("business feature") || normalized.includes("upgrade to business")) {
    return "business";
  }
  if (normalized.includes("upgrade to pro") || normalized.includes("pro feature")) {
    return "pro";
  }
  return null;
}

function isLimitOrUpgradeMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("upgrade to pro") ||
    normalized.includes("upgrade to business") ||
    normalized.includes("business feature") ||
    normalized.includes("pro feature") ||
    normalized.includes("plan limit") ||
    normalized.includes("limit reached")
  );
}

export function getUpgradeModalDetailFromError(error: unknown): UpgradeModalDetail | null {
  const sourceMessage = extractErrorMessage(error).trim();
  if (!sourceMessage || !isLimitOrUpgradeMessage(sourceMessage)) {
    return null;
  }

  return {
    planId: inferUpgradePlanFromMessage(sourceMessage),
    sourceMessage,
  };
}

export function openUpgradeModalFromError(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  const detail = getUpgradeModalDetailFromError(error);
  if (!detail) return false;
  window.dispatchEvent(new CustomEvent<UpgradeModalDetail>(UPGRADE_MODAL_EVENT, { detail }));
  return true;
}
