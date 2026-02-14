import React from "react";
import { useTranslation } from "react-i18next";
import DeptSettings from "./DeptSettings";
import TeamSettings from "./TeamSettings";
import Billing from "./Billing";

export type OrgSettingsTab = "integrations" | "team" | "billing";

const OrgSettings: React.FC<{ tab: OrgSettingsTab }> = ({ tab }) => {
  const { t } = useTranslation();
  const tabTitle = tab === "integrations"
    ? t("settings.integrations")
    : tab === "team"
      ? t("settings.team")
      : t("settings.billing");

  return (
    <div className="space-y-4">
      <div className="px-8 pt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70">
        {tabTitle}
      </div>
      {tab === "integrations" ? <DeptSettings /> : null}
      {tab === "team" ? <TeamSettings /> : null}
      {tab === "billing" ? <Billing /> : null}
    </div>
  );
};

export default OrgSettings;
