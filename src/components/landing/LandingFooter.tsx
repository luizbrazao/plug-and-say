import { useTranslation } from "react-i18next";

const FOOTER_GROUPS = [
  {
    titleKey: "landing.footer.solution",
    links: ["opsIntelligence", "automation", "security"],
  },
  {
    titleKey: "landing.footer.customers",
    links: ["agencies", "startups", "enterprises"],
  },
  {
    titleKey: "landing.footer.resources",
    links: ["pricing", "documentation", "blog"],
  },
] as const;

export function LandingFooter() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-[#d9d4c9] bg-[#f3efe8]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 md:grid-cols-4 md:px-6">
        <div className="space-y-3">
          <img
            src="/PlugandSay.png"
            alt="PlugandSay"
            className="h-10 w-auto object-contain"
          />
          <p className="text-sm text-[#4f6462]">{t("landing.footer.tagline")}</p>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <div key={group.titleKey} className="space-y-3">
            <h4 className="text-sm font-semibold text-[#062427]">
              {t(group.titleKey)}
            </h4>
            <ul className="space-y-2 text-sm text-[#4f6462]">
              {group.links.map((link) => (
                <li key={link}>
                  <a href="#" className="transition-colors hover:text-[#062427]">
                    {t(`landing.footer.${link}`)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[#d9d4c9] py-5 text-center text-xs text-[#637775]">
        {t("landing.footer.copyright")}
      </div>
    </footer>
  );
}
