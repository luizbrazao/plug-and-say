import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOrg } from "../OrgContext";
import { openUpgradeModalFromError } from "../lib/upgradeModal";

function getInitials(name?: string) {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

const TeamSettings: React.FC = () => {
    const { activeOrgId, organizations } = useOrg();
    const members = useQuery(api.organizations.listMembers, activeOrgId ? { orgId: activeOrgId } : "skip");
    const createInvite = useMutation(api.invites.create);
    const removeMember = useMutation((api as any).organizations.removeMember);

    const [role, setRole] = useState<"admin" | "member">("member");
    const [email, setEmail] = useState("");
    const [inviteLink, setInviteLink] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);

    const activeOrg = useMemo(
        () => organizations?.find((org) => org._id === activeOrgId),
        [organizations, activeOrgId]
    );
    const canManageMembers = activeOrg?.role === "owner" || activeOrg?.role === "admin";

    if (!activeOrgId) return <div className="p-8">Select an organization.</div>;
    if (members === undefined) return <div className="p-8">Loading team...</div>;

    const handleCreateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsCreating(true);
            const token = await createInvite({
                orgId: activeOrgId,
                role,
                email: email.trim() || undefined,
            });
            const link = `http://localhost:5173/join/${token}`;
            setInviteLink(link);
        } catch (err: unknown) {
            if (openUpgradeModalFromError(err)) return;
            const message = err instanceof Error ? err.message : "Unknown error";
            window.alert("Error: " + message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleRemoveMember = async (member: any) => {
        if (!activeOrgId) return;
        const confirmed = window.confirm(`Remove ${member.name || member.email || "this member"} from the organization?`);
        if (!confirmed) return;

        try {
            setRemovingMembershipId(String(member._id));
            await removeMember({
                orgId: activeOrgId,
                membershipId: member._id,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown error";
            window.alert("Error: " + message);
        } finally {
            setRemovingMembershipId(null);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <header>
                <h1 className="text-2xl font-bold italic tracking-tight">TEAM</h1>
                <p className="text-sm opacity-60 font-mono">
                    Members and invitations for {activeOrg?.name || "selected organization"}.
                </p>
            </header>

            <section className="glass-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider">Invite Member</h2>
                </div>
                <form onSubmit={(e) => { void handleCreateInvite(e); }} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="space-y-1 md:col-span-1">
                        <label className="text-[10px] font-bold opacity-50 uppercase tracking-wider">Role</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value as "admin" | "member")}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="member" className="text-black">Member</option>
                            <option value="admin" className="text-black">Admin</option>
                        </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold opacity-50 uppercase tracking-wider">Email (Optional)</label>
                        <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="person@company.com"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isCreating}
                        className="px-4 py-2 bg-text-primary text-white rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                    >
                        {isCreating ? "Inviting..." : "Invite Member"}
                    </button>
                </form>

                {inviteLink && (
                    <div className="mt-2 p-4 rounded-xl border border-border-subtle bg-white/70 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Shareable Invite Link</p>
                        <div className="flex items-center gap-2">
                            <input
                                readOnly
                                value={inviteLink}
                                className="flex-1 bg-white border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono"
                            />
                            <button
                                type="button"
                                onClick={() => { void navigator.clipboard.writeText(inviteLink); }}
                                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold uppercase"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider">Current Members</h2>
                {members.length === 0 ? (
                    <div className="p-8 border border-dashed border-white/20 rounded-2xl text-sm opacity-60">
                        No members found.
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {members.map((member) => (
                            <div key={member._id} className="glass-card p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-full border border-border-subtle bg-white overflow-hidden flex items-center justify-center flex-shrink-0">
                                        {member.avatarUrl ? (
                                            <img
                                                src={member.avatarUrl}
                                                alt={`${member.name || "User"} avatar`}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-xs font-bold text-text-secondary">
                                                {getInitials(member.name)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-text-primary truncate">
                                            {member.name || "Unknown User"}
                                        </p>
                                        <p className="text-xs text-text-secondary truncate">
                                            {member.email || "No email"}
                                        </p>
                                        <p className="text-[10px] opacity-60 uppercase mt-0.5">
                                            Joined {new Date(member.joinedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-accent-cream text-text-secondary">
                                        {member.role}
                                    </span>
                                    {canManageMembers && member.role !== "owner" ? (
                                        <button
                                            type="button"
                                            onClick={() => { void handleRemoveMember(member); }}
                                            disabled={removingMembershipId === String(member._id)}
                                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white disabled:opacity-50"
                                            title="Remove member"
                                        >
                                            {removingMembershipId === String(member._id) ? "Removing..." : "Remove"}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default TeamSettings;
