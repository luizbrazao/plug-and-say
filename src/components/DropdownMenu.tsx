import { useEffect, useRef, useState } from "react";

type MenuItem = {
    label: string;
    onClick: () => void;
    danger?: boolean;
};

interface DropdownMenuProps {
    items: MenuItem[];
    ariaLabel?: string;
}

export default function DropdownMenu({ items, ariaLabel = "Open menu" }: DropdownMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;

        const onDocMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (rootRef.current && !rootRef.current.contains(target)) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", onDocMouseDown);
        return () => {
            document.removeEventListener("mousedown", onDocMouseDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                className="p-1.5 hover:bg-black/5 rounded-full cursor-pointer"
                aria-label={ariaLabel}
                title={ariaLabel}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="12" cy="19" r="1.8" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 mt-1 w-44 rounded-xl border border-border-subtle bg-white shadow-lg p-1 z-20">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            onClick={() => {
                                setOpen(false);
                                item.onClick();
                            }}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg ${item.danger ? "text-red-600 hover:bg-red-50" : "hover:bg-black/5"
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
