import { MousePointer2 } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { dicebearBotttsUrl } from "../../lib/avatar";

type AgentItem = {
  name: "Jarvis" | "Vision" | "Friday" | "Wanda" | "Tony" | "Pepper";
  className: string;
  cursorClassName: string;
  cursorRotateClassName: string;
  delay: number;
};

const AGENTS: AgentItem[] = [
  {
    name: "Tony",
    className: "left-1/2 top-15 -translate-x-[14rem] lg:-translate-x-[18rem] xl:-translate-x-[30rem]",
    cursorClassName: "-right-3 top-1/2 translate-y-1/2",
    cursorRotateClassName: "rotate-180",
    delay: 0.05,
  },
  {
    name: "Pepper",
    className: "left-1/2 top-15 translate-x-[10rem] lg:translate-x-[14rem] xl:translate-x-[25rem]",
    cursorClassName: "-left-3 top-1/2 translate-y-1/2",
    cursorRotateClassName: "-rotate-90",
    delay: 0.15,
  },

  {
    name: "Friday",
    className: "left-1/2 top-[62%] -translate-x-[26rem] lg:-translate-x-[30rem] xl:-translate-x-[36rem]",
    cursorClassName: "-right-3 top-1/2 -translate-y-1/2",
    cursorRotateClassName: "rotate-90",
    delay: 0.4,
  },
  {
    name: "Wanda",
    className: "left-1/2 top-[52%] translate-x-[19rem] lg:translate-x-[23rem] xl:translate-x-[26rem]",
    cursorClassName: "-left-3 top-1/2 -translate-y-1/2",
    cursorRotateClassName: "",
    delay: 0.6,
  },
];

export function HeroAgents() {
  const { t } = useTranslation();

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10 hidden md:block">
        {AGENTS.map((agent) => (
          <motion.div
            key={agent.name}
            className={`absolute ${agent.className} will-change-transform`}
            animate={{
              y: [0, -2, 0],
              x: [0, 4, 0],
            }}
            transition={{
              delay: agent.delay,
              duration: 4,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          >
            <div className="relative">
              <div className="flex items-center gap-2 rounded-full border border-[#d9d4c9] bg-white px-2.5 py-1 shadow-md">
                <img
                  src={dicebearBotttsUrl(agent.name)}
                  alt={t("landing.hero.agentAlt", { name: agent.name })}
                  className="h-10 w-10 rounded-full bg-white p-1"
                />
                <div className="flex flex-col gap-0.5 pr-0.5">
                  <span className="text-xs font-semibold leading-none text-[#062427]">{agent.name}</span>
                  <span className="inline-flex w-fit rounded-full border border-[#d9d4c9] bg-[#f7f4f0] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] leading-none text-[#5b7371]">
                    {t(`landing.hero.agentRoles.${agent.name}`)}
                  </span>
                </div>
              </div>
              <motion.div
                className={`absolute ${agent.cursorClassName} inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#c0d86d] bg-[#d4ff3f] text-[#062427] ${agent.cursorRotateClassName}`}
                animate={{ y: [0, -1, 0] }}
                transition={{
                  duration: 2.2,
                  delay: agent.delay,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }}
              >
                <MousePointer2 size={12} />
              </motion.div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:hidden">
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center gap-2 rounded-2xl border border-[#d9d4c9] bg-white/80 px-3 py-2"
          >
            <img
              src={dicebearBotttsUrl(agent.name)}
              alt={t("landing.hero.agentAlt", { name: agent.name })}
              className="h-9 w-9 rounded-full bg-white p-1"
            />
            <div className="flex flex-col gap-1 leading-tight">
              <div className="text-sm font-semibold text-[#062427]">{agent.name}</div>
              <span className="inline-flex w-fit rounded-full border border-[#d9d4c9] bg-[#f7f4f0] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] leading-none text-[#5b7371]">
                {t(`landing.hero.agentRoles.${agent.name}`)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
