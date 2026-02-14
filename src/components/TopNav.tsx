import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { useDept } from "../DeptContext";
import i18n, { normalizeSupportedLanguage, type SupportedLanguage } from "../i18n/config";
import { useOrg } from "../OrgContext";

function getInitials(name?: string | null) {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function TopNav() {
    const { signOut } = useAuthActions();
    const { t } = useTranslation();
    const viewer = useQuery((api as any).viewer.get, {});
    const generateAvatarUploadUrl = useMutation((api as any).viewer.generateAvatarUploadUrl);
    const updateProfile = useMutation((api as any).viewer.updateProfile);
    const updateOrganizationLanguage = useMutation((api as any).organizations.updateLanguage);
    const { activeDeptId, departments } = useDept();
    const { activeOrgId } = useOrg();
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [activePanel, setActivePanel] = useState<
        | null
        | "perfil"
        | "ajuda_legal"
    >(null);
    const userMenuRef = useRef<HTMLDivElement | null>(null);
    const avatarInputRef = useRef<HTMLInputElement | null>(null);
    const initials = getInitials(viewer?.name);
    const userDisplayName = viewer?.name?.trim() || t("topNav.defaults.user");
    const activeDept = departments?.find((d) => d._id === activeDeptId);
    const currentPlan = (activeDept?.plan as "free" | "pro" | "enterprise" | undefined) ?? "free";
    const currentPlanLabel =
        currentPlan === "enterprise"
            ? t("topNav.plan.team")
            : currentPlan === "pro"
                ? t("topNav.plan.pro")
                : t("topNav.plan.free");

    const [profileName, setProfileName] = useState("");
    const [profileEmail, setProfileEmail] = useState("");
    const [profileRole, setProfileRole] = useState(t("topNav.profile.defaultRole"));
    const [profileLanguage, setProfileLanguage] = useState<SupportedLanguage>("pt");
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
    const [avatarStorageId, setAvatarStorageId] = useState<string | undefined>(undefined);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const panelTitle: Record<NonNullable<typeof activePanel>, string> = {
        perfil: t("topNav.panels.profile"),
        ajuda_legal: t("topNav.panels.helpLegal"),
    };

    useEffect(() => {
        if (!isUserMenuOpen) return;

        const onDocMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (userMenuRef.current && !userMenuRef.current.contains(target)) {
                setIsUserMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, [isUserMenuOpen]);

    useEffect(() => {
        const onEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsUserMenuOpen(false);
                setActivePanel(null);
            }
        };
        document.addEventListener("keydown", onEsc);
        return () => document.removeEventListener("keydown", onEsc);
    }, []);

    useEffect(() => {
        if (activePanel !== "perfil") return;
        setProfileName(viewer?.name?.trim() || "");
        setProfileEmail(viewer?.email?.trim() || "");
        setProfileRole(viewer?.role?.trim() || t("topNav.profile.defaultRole"));
        setProfileLanguage(normalizeSupportedLanguage(viewer?.language));
        setAvatarPreviewUrl(viewer?.avatarUrl || null);
        setAvatarStorageId(undefined);
    }, [activePanel, viewer?.name, viewer?.email, viewer?.role, viewer?.language, viewer?.avatarUrl, t]);

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const MAX_AVATAR_SIZE_BYTES = 1024 * 1024; // 1MB
        if (file.size > MAX_AVATAR_SIZE_BYTES) {
            alert(t("topNav.profile.avatarTooLarge", { maxSize: "1MB" }));
            event.currentTarget.value = "";
            return;
        }
        setIsUploadingAvatar(true);
        try {
            const objectUrl = URL.createObjectURL(file);
            setAvatarPreviewUrl(objectUrl);

            const postUrl = await generateAvatarUploadUrl({});
            const uploadResponse = await fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": file.type || "application/octet-stream" },
                body: file,
            });
            if (!uploadResponse.ok) {
                throw new Error("Avatar upload failed.");
            }
            const uploadJson = await uploadResponse.json();
            const storageId = uploadJson.storageId as string | undefined;
            if (!storageId) {
                throw new Error("Missing storageId from avatar upload.");
            }
            setAvatarStorageId(storageId);
        } catch (error) {
            console.error("[TopNav] avatar upload failed:", error);
            alert(t("topNav.profile.avatarUploadError"));
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        try {
            const nextLanguage = normalizeSupportedLanguage(profileLanguage);
            await updateProfile({
                displayName: profileName.trim(),
                email: profileEmail.trim(),
                role: profileRole.trim(),
                language: nextLanguage,
                ...(avatarStorageId !== undefined ? { avatarStorageId: avatarStorageId as any } : {}),
            });
            if (activeOrgId) {
                try {
                    await updateOrganizationLanguage({
                        orgId: activeOrgId,
                        language: nextLanguage,
                    });
                } catch (error) {
                    console.error("[TopNav] org language update failed:", error);
                    alert(t("topNav.profile.orgLanguageSyncError"));
                }
            }
            await i18n.changeLanguage(nextLanguage);
            setActivePanel(null);
        } catch (error) {
            console.error("[TopNav] profile save failed:", error);
            alert(t("topNav.profile.saveError"));
        } finally {
            setIsSavingProfile(false);
        }
    };

    return (
        <>
            <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-border-subtle bg-white/50 backdrop-blur-sm z-10">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <img
                            src="/PlugandSay.png"
                            alt="PlugandSay"
                            className="h-8 w-auto object-contain"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div ref={userMenuRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setIsUserMenuOpen((prev) => !prev)}
                            className="w-9 h-9 rounded-full border border-border-subtle bg-white flex items-center justify-center text-[11px] font-bold uppercase tracking-wide text-text-secondary hover:text-text-primary hover:bg-black/5 transition-colors overflow-hidden"
                            title={t("topNav.menu.open")}
                            aria-label={t("topNav.menu.open")}
                        >
                            {viewer?.avatarUrl ? (
                                <img
                                    src={viewer.avatarUrl}
                                    alt={t("topNav.profile.userAvatarAlt")}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                initials
                            )}
                        </button>

                        {isUserMenuOpen && (
                            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border-subtle bg-white shadow-xl p-1.5 z-30 text-text-primary">
                                <div className="px-3 py-2 border-b border-border-subtle mb-1 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full border border-border-subtle bg-warm-bg overflow-hidden flex items-center justify-center text-sm font-semibold text-text-secondary">
                                        {viewer?.avatarUrl ? (
                                            <img
                                                src={viewer.avatarUrl}
                                                alt={t("topNav.profile.userAvatarAlt")}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            getInitials(userDisplayName)
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold truncate">{userDisplayName}</div>
                                        <div className="text-xs text-text-secondary truncate">{viewer?.email || t("topNav.defaults.noEmail")}</div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        setIsUserMenuOpen(false);
                                        setActivePanel("perfil");
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-black/5 flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="8" r="4"></circle>
                                        <path d="M4 20c1.8-3.2 5-5 8-5s6.2 1.8 8 5"></path>
                                    </svg>
                                    {t("topNav.menu.profile")}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsUserMenuOpen(false);
                                        if (typeof window !== "undefined") {
                                            window.dispatchEvent(new CustomEvent("mc:open-billing-plan"));
                                        }
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-black/5 flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="2.5" y="5.5" width="19" height="13" rx="2"></rect>
                                        <line x1="2.5" y1="10" x2="21.5" y2="10"></line>
                                    </svg>
                                    {t("topNav.menu.billingPlan")}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsUserMenuOpen(false);
                                        if (typeof window !== "undefined") {
                                            window.dispatchEvent(new CustomEvent("mc:open-team-members"));
                                        }
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-black/5 flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <circle cx="9" cy="8" r="3"></circle>
                                        <circle cx="17" cy="10" r="2.5"></circle>
                                        <path d="M3.5 19c1.4-2.7 3.8-4 5.5-4 1.8 0 4.2 1.3 5.5 4"></path>
                                        <path d="M14.5 19c.8-1.8 2.2-2.8 3.6-2.8 1.1 0 2.3.6 3.2 1.8"></path>
                                    </svg>
                                    {t("topNav.menu.team")}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsUserMenuOpen(false);
                                        setActivePanel("ajuda_legal");
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-black/5 flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="12" r="9"></circle>
                                        <path d="M12 16.5v.01"></path>
                                        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.9.6-1.3 1.1-1.3 2.1"></path>
                                    </svg>
                                    {t("topNav.menu.helpLegal")}
                                </button>
                                <div className="my-1 border-t border-border-subtle" />
                                <button
                                    onClick={() => {
                                        setIsUserMenuOpen(false);
                                        signOut();
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                                        <path d="M10 17l5-5-5-5"></path>
                                        <path d="M15 12H3"></path>
                                    </svg>
                                    {t("topNav.menu.signOut")}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {activePanel && (
                <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-2xl border border-border-subtle bg-white text-text-primary shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
                            <h2 className="text-xl font-semibold">{panelTitle[activePanel]}</h2>
                            <button
                                type="button"
                                onClick={() => setActivePanel(null)}
                                className="w-8 h-8 rounded-lg hover:bg-black/5 text-text-secondary hover:text-text-primary"
                                aria-label={t("topNav.panel.close")}
                            >
                                ×
                            </button>
                        </div>
                        <div className="p-5">
                            {activePanel === "perfil" ? (
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-text-secondary">{t("topNav.profile.subtitle")}</div>
                                        <span
                                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${currentPlan === "pro"
                                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                                : currentPlan === "enterprise"
                                                    ? "bg-violet-50 text-violet-700 border-violet-200"
                                                    : "bg-gray-100 text-gray-700 border-gray-200"
                                                }`}
                                        >
                                            {t("topNav.profile.planBadge", { plan: currentPlanLabel })}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="w-20 h-20 rounded-full bg-warm-bg border border-border-subtle overflow-hidden flex items-center justify-center">
                                            {avatarPreviewUrl ? (
                                                <img
                                                    src={avatarPreviewUrl}
                                                    alt={t("topNav.profile.avatarPreviewAlt")}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <span className="text-xl font-bold text-text-secondary">
                                                    {getInitials(profileName || viewer?.name)}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => avatarInputRef.current?.click()}
                                                className="px-3 py-2 text-sm font-medium rounded-lg border border-border-subtle bg-white hover:bg-black/5 disabled:opacity-60"
                                                disabled={isUploadingAvatar}
                                            >
                                                {isUploadingAvatar ? t("topNav.profile.uploadingAvatar") : t("topNav.profile.uploadAvatar")}
                                            </button>
                                            <div className="text-xs text-text-secondary mt-2">
                                                {t("topNav.profile.avatarHint", { maxSize: "1MB" })}
                                            </div>
                                            <input
                                                ref={avatarInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(event) => {
                                                    void handleAvatarUpload(event);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-1">{t("topNav.profile.name")}</label>
                                            <input
                                                type="text"
                                                value={profileName}
                                                onChange={(event) => setProfileName(event.target.value)}
                                                className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                placeholder={t("topNav.profile.namePlaceholder")}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-1">{t("topNav.profile.email")}</label>
                                            <input
                                                type="email"
                                                value={profileEmail}
                                                onChange={(event) => setProfileEmail(event.target.value)}
                                                className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                placeholder={t("topNav.profile.emailPlaceholder")}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-1">{t("topNav.profile.role")}</label>
                                            <input
                                                type="text"
                                                value={profileRole}
                                                onChange={(event) => setProfileRole(event.target.value)}
                                                className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                placeholder={t("topNav.profile.rolePlaceholder")}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-1">{t("topNav.profile.language")}</label>
                                            <select
                                                value={profileLanguage}
                                                onChange={(event) => setProfileLanguage(normalizeSupportedLanguage(event.target.value))}
                                                className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                            >
                                                <option value="pt">{t("topNav.profile.languageOptions.pt")}</option>
                                                <option value="en">{t("topNav.profile.languageOptions.en")}</option>
                                                <option value="es">{t("topNav.profile.languageOptions.es")}</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setActivePanel(null)}
                                            className="px-4 py-2 text-sm font-medium rounded-lg border border-border-subtle hover:bg-black/5"
                                        >
                                            {t("common.cancel")}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSaveProfile}
                                            className="px-4 py-2 text-sm font-medium rounded-lg bg-text-primary text-white hover:opacity-90 disabled:opacity-60"
                                            disabled={isSavingProfile || isUploadingAvatar}
                                        >
                                            {isSavingProfile ? t("language.saving") : t("common.save")}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border-subtle bg-warm-bg/40 p-4">
                                    <div className="text-sm text-text-primary mb-2">
                                        {t("topNav.helpLegal.placeholderTitle", { panel: panelTitle[activePanel] })}
                                    </div>
                                    <div className="text-sm text-text-secondary">
                                        {t("topNav.helpLegal.placeholderDescription")}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
