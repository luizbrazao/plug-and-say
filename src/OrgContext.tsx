import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import i18n, { normalizeSupportedLanguage, type SupportedLanguage } from "./i18n/config";

type OrgRole = "owner" | "admin" | "member";

type OrganizationSummary = {
    _id: Id<"organizations">;
    name: string;
    language?: SupportedLanguage | string;
    role: OrgRole;
};

interface OrgContextType {
    activeOrgId: Id<"organizations"> | null;
    setActiveOrgId: (id: Id<"organizations"> | null) => void;
    organizations: OrganizationSummary[] | undefined;
    isLoading: boolean;
    needsOnboarding: boolean;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);
const PENDING_INVITE_TOKEN_KEY = "mission-control-pending-invite-token";

export const OrgProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeOrgId, setActiveOrgId] = useState<Id<"organizations"> | null>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("mission-control-org-id");
            return saved ? (saved as Id<"organizations">) : null;
        }
        return null;
    });

    const organizations = useQuery(api.organizations.listForUser) as OrganizationSummary[] | undefined;
    const createOrganization = useMutation(api.organizations.create);
    const [newOrgName, setNewOrgName] = useState("");
    const [isCreatingOrg, setIsCreatingOrg] = useState(false);

    useEffect(() => {
        if (!organizations) return;

        if (organizations.length === 0) {
            setActiveOrgId(null);
            localStorage.removeItem("mission-control-org-id");
            return;
        }

        if (activeOrgId && organizations.some((org) => org._id === activeOrgId)) {
            return;
        }

        setActiveOrgId(organizations[0]._id);
    }, [organizations, activeOrgId]);

    useEffect(() => {
        if (activeOrgId) {
            localStorage.setItem("mission-control-org-id", activeOrgId);
        }
    }, [activeOrgId]);

    const activeOrganization = useMemo(() => {
        if (!organizations || organizations.length === 0) return null;
        if (!activeOrgId) return organizations[0];
        return organizations.find((org) => org._id === activeOrgId) ?? organizations[0];
    }, [organizations, activeOrgId]);

    useEffect(() => {
        const targetLanguage = normalizeSupportedLanguage(activeOrganization?.language);
        if (i18n.resolvedLanguage === targetLanguage) return;
        void i18n.changeLanguage(targetLanguage);
    }, [activeOrganization?.language]);

    const needsOnboarding = organizations !== undefined && organizations.length === 0;
    const hasPendingInviteFlow = (() => {
        if (typeof window === "undefined") return false;
        if (window.location.pathname.startsWith("/join/")) return true;
        return Boolean(window.localStorage.getItem(PENDING_INVITE_TOKEN_KEY));
    })();

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = newOrgName.trim();
        if (!name) return;

        try {
            setIsCreatingOrg(true);
            const id = await createOrganization({ name });
            setActiveOrgId(id);
            localStorage.setItem("mission-control-org-id", id);
            setNewOrgName("");
        } finally {
            setIsCreatingOrg(false);
        }
    };

    return (
        <OrgContext.Provider value={{ activeOrgId, setActiveOrgId, organizations, isLoading: organizations === undefined, needsOnboarding }}>
            {needsOnboarding && !hasPendingInviteFlow ? (
                <div className="h-screen w-screen flex items-center justify-center bg-warm-bg p-6">
                    <form onSubmit={handleCreateOrg} className="w-full max-w-md bg-white rounded-2xl border border-border-subtle p-6 shadow-sm space-y-4">
                        <h1 className="text-xl font-bold">Create Organization</h1>
                        <p className="text-sm text-text-secondary">You do not belong to any organization yet. Create one to continue.</p>
                        <input
                            value={newOrgName}
                            onChange={(event) => setNewOrgName(event.target.value)}
                            placeholder="Organization name"
                            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-1 ring-blue-500"
                            autoFocus
                            required
                        />
                        <button
                            type="submit"
                            disabled={isCreatingOrg}
                            className="w-full rounded-lg bg-text-primary text-white py-2 text-sm font-bold disabled:opacity-60"
                        >
                            {isCreatingOrg ? "Creating..." : "Create Organization"}
                        </button>
                    </form>
                </div>
            ) : (
                children
            )}
        </OrgContext.Provider>
    );
};

export const useOrg = () => {
    const context = useContext(OrgContext);
    if (context === undefined) {
        throw new Error("useOrg must be used within a OrgProvider");
    }
    return context;
};
