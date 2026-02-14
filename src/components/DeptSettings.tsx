import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useDept } from "../DeptContext";
import { useOrg } from "../OrgContext";
import { CredentialGalleryModal } from "./integrations/CredentialGalleryModal";
import { CredentialList } from "./integrations/CredentialList";
import { CredentialModal } from "./integrations/CredentialModal";

const DeptSettings: React.FC = () => {
    const { activeDeptId } = useDept();
    const { activeOrgId } = useOrg();
    const integrations = useQuery(api.integrations.listByOrg, activeOrgId ? { orgId: activeOrgId } : "skip");
    const deleteIntegration = useMutation(api.integrations.remove);

    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [activeService, setActiveService] = useState<string | null>(null);

    const activeIntegration = useMemo(() => {
        if (!integrations || !activeService) return undefined;
        return integrations.find((row) => row.type === activeService);
    }, [activeService, integrations]);

    if (!activeOrgId) return <div className="p-8">Select an organization.</div>;
    if (integrations === undefined) return <div className="p-8">Loading settings...</div>;

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Credencial manager</h1>
                    <p className="text-sm opacity-60 font-mono">Organization credentials shared across departments.</p>
                </div>
                <button
                    onClick={() => setIsGalleryOpen(true)}
                    className="px-4 py-2 bg-text-primary text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg hover:scale-105 transition-all"
                >
                    Create Credential
                </button>
            </header>

            <CredentialList
                integrations={integrations ?? []}
                onCreateCredential={() => setIsGalleryOpen(true)}
                onDeleteCredential={async (id) => {
                    await deleteIntegration({ id });
                }}
            />

            <CredentialGalleryModal
                isOpen={isGalleryOpen}
                onClose={() => setIsGalleryOpen(false)}
                onSelectService={(service) => {
                    setIsGalleryOpen(false);
                    setActiveService(service);
                }}
            />

            <CredentialModal
                isOpen={!!activeService}
                service={activeService}
                orgId={activeOrgId}
                departmentId={activeDeptId ?? undefined}
                integration={activeIntegration}
                onClose={() => setActiveService(null)}
            />
        </div>
    );
};

export default DeptSettings;

