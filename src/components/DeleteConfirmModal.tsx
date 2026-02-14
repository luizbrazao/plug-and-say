import { useEffect, useState } from "react";

interface DeleteConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    entityName: string;
    helperText: string;
    onConfirm: () => Promise<void>;
}

export default function DeleteConfirmModal({
    isOpen,
    onClose,
    title,
    entityName,
    helperText,
    onConfirm,
}: DeleteConfirmModalProps) {
    const [typed, setTyped] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) setTyped("");
    }, [isOpen]);

    if (!isOpen) return null;

    const canDelete = typed.trim() === entityName;

    const handleDelete = async () => {
        if (!canDelete) return;
        setIsSubmitting(true);
        try {
            await onConfirm();
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white/90 shadow-2xl backdrop-blur-md p-6">
                <h2 className="text-lg font-bold tracking-tight text-red-700">{title}</h2>
                <p className="mt-2 text-sm text-text-secondary">{helperText}</p>
                <p className="mt-3 text-xs font-mono text-text-secondary">
                    Type <span className="font-bold text-text-primary">{entityName}</span> to confirm.
                </p>

                <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                    placeholder={entityName}
                    autoFocus
                />

                <div className="flex justify-end gap-2 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-text-secondary hover:bg-black/5"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={!canDelete || isSubmitting}
                        className="px-5 py-2 rounded-lg bg-red-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-colors disabled:opacity-60"
                    >
                        {isSubmitting ? "Deleting..." : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}
