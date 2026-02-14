import { Menu } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../lib/router";

const NAV_ITEMS = [
  { key: "features", href: "#features" },
  { key: "pricing", href: "#pricing" },
] as const;

export function LandingNavbar() {
  const { t } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#d9d4c9]/60 bg-[#f7f4f0]/85 backdrop-blur-md">
      <nav className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="inline-flex items-center text-[#062427]">
          <img
            src="/PlugandSay.png"
            alt="PlugandSay"
            className="h-9 w-auto object-contain md:h-10"
          />
        </Link>

        <div className="hidden items-center gap-8 text-sm font-medium text-[#153234] lg:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="transition-colors hover:text-[#062427]"
            >
              {t(`landing.nav.${item.key}`)}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/login"
            className="text-sm font-semibold text-[#062427] transition-opacity hover:opacity-75"
          >
            {t("landing.nav.login")}
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-xl bg-[#d4ff3f] px-5 py-2.5 text-sm font-semibold text-[#062427] transition-all hover:brightness-95"
          >
            {t("landing.nav.buildSquad")}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d9d4c9] text-[#062427] md:hidden"
          aria-label={t("landing.nav.openMenu")}
        >
          <Menu size={18} />
        </button>
      </nav>
      {isMobileMenuOpen ? (
        <div className="border-t border-[#d9d4c9] bg-[#f7f4f0] px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3 text-sm font-medium text-[#153234]">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.key}
                href={item.href}
                className="rounded-lg px-2 py-1.5 hover:bg-white"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t(`landing.nav.${item.key}`)}
              </a>
            ))}
            <Link
              href="/login"
              className="rounded-lg px-2 py-1.5 hover:bg-white"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {t("landing.nav.login")}
            </Link>
            <Link
              href="/signup"
              className="mt-1 inline-flex items-center justify-center rounded-xl bg-[#d4ff3f] px-4 py-2.5 font-semibold text-[#062427]"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {t("landing.nav.buildSquad")}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
