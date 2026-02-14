import { useState } from "react";
import { useDept } from "../DeptContext";
import { openUpgradeModalFromError } from "../lib/upgradeModal";

interface CreateDeptModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CreateDeptModal({ isOpen, onClose }: CreateDeptModalProps) {
    const { createDepartment } = useDept();
    const [name, setName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;

        setIsSubmitting(true);
        try {
            await createDepartment(trimmed);
            setName("");
            onClose();
        } catch (error: unknown) {
            if (openUpgradeModalFromError(error)) return;
            const message = error instanceof Error ? error.message : "Unknown error";
            window.alert(`Failed to create department: ${message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/25 bg-white/70 shadow-2xl backdrop-blur-md p-6 animate-in fade-in zoom-in duration-200">
                <h2 className="text-lg font-bold tracking-tight text-text-primary">Create Department</h2>
                <p className="mt-1 text-sm text-text-secondary">Add a new department to your active organization.</p>

                <form onSubmit={onSubmit} className="mt-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-60 uppercase tracking-wider">Department Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Marketing"
                            className="w-full rounded-xl border border-black/10 bg-white/75 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-text-secondary hover:bg-black/5"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !name.trim()}
                            className="px-5 py-2 rounded-lg bg-text-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-60"
                        >
                            {isSubmitting ? "Creating..." : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
