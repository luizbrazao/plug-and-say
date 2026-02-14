import { useEffect, useState } from "react";

interface EditNameModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    label: string;
    currentName: string;
    onSubmit: (nextName: string) => Promise<void>;
}

export default function EditNameModal({
    isOpen,
    onClose,
    title,
    label,
    currentName,
    onSubmit,
}: EditNameModalProps) {
    const [value, setValue] = useState(currentName);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) setValue(currentName);
    }, [isOpen, currentName]);

    if (!isOpen) return null;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const next = value.trim();
        if (!next) return;

        setIsSubmitting(true);
        try {
            await onSubmit(next);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/25 bg-white/70 shadow-2xl backdrop-blur-md p-6">
                <h2 className="text-lg font-bold tracking-tight text-text-primary">{title}</h2>
                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-60 uppercase tracking-wider">{label}</label>
                        <input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
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
                            disabled={isSubmitting || !value.trim()}
                            className="px-5 py-2 rounded-lg bg-text-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-60"
                        >
                            {isSubmitting ? "Saving..." : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
