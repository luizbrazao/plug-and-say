import React, { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import { Lock, Mail } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { navigate } from "../lib/router";

type SignInProps = {
    embedded?: boolean;
    initialMode?: "signIn" | "signUp";
};

export const SignIn: React.FC<SignInProps> = ({ embedded = false, initialMode = "signIn" }) => {
    const { signIn } = useAuthActions();
    const { isAuthenticated } = useConvexAuth();
    const cleanupOrphanAuthAccounts = useMutation((api as any).authRepairs.cleanupOrphanAuthAccounts);
    const [mode, setMode] = useState<"signIn" | "signUp">(initialMode);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAwaitingSession, setIsAwaitingSession] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isAuthenticated || !isAwaitingSession) return;
        navigate("/dashboard", { replace: true });
    }, [isAuthenticated, isAwaitingSession]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (mode === "signUp" && password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        if (mode === "signUp" && password.length < 8) {
            setError("Password must have at least 8 characters.");
            return;
        }

        const trimmedName = `${firstName} ${lastName}`.trim();
        setIsSubmitting(true);
        setIsAwaitingSession(false);
        setError(null);
        try {
            await signIn("password", {
                email,
                password,
                flow: mode,
                ...(trimmedName ? { name: trimmedName } : {}),
            });
            setIsAwaitingSession(true);
        } catch (err: any) {
            const message = String(err?.message || "Authentication failed");
            if (message.includes("Cannot read properties of null (reading '_id')")) {
                try {
                    await cleanupOrphanAuthAccounts({
                        provider: "password",
                        accountId: email.trim(),
                    });
                    await signIn("password", {
                        email,
                        password,
                        flow: mode,
                        ...(trimmedName ? { name: trimmedName } : {}),
                    });
                    setIsAwaitingSession(true);
                    return;
                } catch (retryError: any) {
                    setError(String(retryError?.message || "Authentication failed after account repair."));
                    setIsAwaitingSession(false);
                    return;
                }
            }
            if (message.toLowerCase().includes("invalid password")) {
                setError("Invalid password. Use at least 8 characters and try again.");
            } else {
                setError(message);
            }
            setIsAwaitingSession(false);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className={embedded ? "w-full" : "min-h-screen bg-[#f7f4f0] overflow-y-auto relative isolate"}>
            {!embedded ? (
                <div
                    className="pointer-events-none absolute inset-0 -z-10 opacity-55"
                    style={{
                        backgroundImage:
                            "linear-gradient(to right, rgba(6,36,39,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(6,36,39,0.08) 1px, transparent 1px)",
                        backgroundSize: "46px 46px",
                    }}
                />
            ) : null}
            <div className={`${embedded ? "" : "min-h-screen"} flex items-start justify-center px-4 py-8 md:py-12`}>
                <div className="w-full max-w-[460px]">
                    <div className="text-center mb-5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#d9d4c9] bg-white/80 px-4 py-2">
                            <img
                                src="/PlugandSay.png"
                                alt="PlugandSay"
                                className="h-8 w-auto object-contain"
                            />
                        </div>
                    </div>

                    <form
                        onSubmit={(e) => { void handleSubmit(e); }}
                        className="rounded-3xl border border-[#d9d4c9] bg-white/85 shadow-[0_18px_36px_rgba(6,36,39,0.10)] backdrop-blur-sm px-5 py-6 md:px-6 md:py-7 space-y-4"
                    >
                        <header className="text-center space-y-1.5">
                            <h2 className="font-display text-5xl leading-none font-semibold tracking-tight text-[#062427] mt-3">
                                {mode === "signIn" ? "Welcome Back" : "Start Your Free Trial"}
                            </h2>
                            <p className="text-sm text-[#4f6462]">
                                {mode === "signIn"
                                    ? "Log in to your dashboard"
                                    : "Create your account and start building with your AI squad."}
                            </p>
                        </header>

                        <button
                            type="button"
                            disabled
                            className="w-full rounded-xl border border-[#d9d4c9] bg-[#f7f4f0] py-2.5 text-base font-semibold text-[#062427] flex items-center justify-center gap-2.5 opacity-70 cursor-not-allowed"
                            title="Google auth coming soon"
                        >
                            <GoogleIcon className="h-5 w-5" />
                            Continue with Google
                        </button>

                        <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-[#d9d4c9]" />
                            <span className="text-sm text-[#657a78]">or</span>
                            <div className="h-px flex-1 bg-[#d9d4c9]" />
                        </div>

                        {mode === "signUp" && (
                            <div className="grid grid-cols-2 gap-2.5">
                                <Field
                                    label="First Name"
                                    value={firstName}
                                    onChange={setFirstName}
                                    placeholder="Enter your first name"
                                    required
                                />
                                <Field
                                    label="Last Name"
                                    value={lastName}
                                    onChange={setLastName}
                                    placeholder="Enter your last name"
                                    required
                                />
                            </div>
                        )}

                        <Field
                            label="Email"
                            type="email"
                            value={email}
                            onChange={setEmail}
                            placeholder="Enter your email"
                            required
                            icon="mail"
                        />

                        <Field
                            label="Password"
                            type="password"
                            value={password}
                            onChange={setPassword}
                            placeholder="Enter your password"
                            required
                            icon="lock"
                        />

                        {mode === "signUp" && (
                            <Field
                                label="Confirm Password"
                                type="password"
                                value={confirmPassword}
                                onChange={setConfirmPassword}
                                placeholder="Confirm your password"
                                required
                                icon="lock"
                            />
                        )}

                        {mode === "signIn" && (
                            <div className="text-right">
                                <button
                                    type="button"
                                    className="text-sm font-semibold text-[#062427] underline decoration-[#d4ff3f] underline-offset-2 hover:opacity-80"
                                    onClick={() => window.alert("Password reset flow coming soon.")}
                                >
                                    Forgot Password?
                                </button>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full rounded-xl py-3 text-base font-semibold text-[#f7f4f0] bg-[#062427] hover:brightness-110 transition-all disabled:opacity-60"
                        >
                            {isSubmitting
                                ? (mode === "signIn" ? "Signing In..." : "Creating Account...")
                                : (mode === "signIn" ? "Sign In" : "Start Free Trial")}
                        </button>

                        <div className="text-center text-[15px]">
                            {mode === "signIn" ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode("signUp");
                                        setError(null);
                                    }}
                                    className="font-semibold text-[#062427] underline decoration-[#d4ff3f] underline-offset-2 hover:opacity-80"
                                >
                                    Don&apos;t have an account? Start the free trial
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode("signIn");
                                        setError(null);
                                    }}
                                    className="font-semibold text-[#062427] underline decoration-[#d4ff3f] underline-offset-2 hover:opacity-80"
                                >
                                    Already have an account? Sign in
                                </button>
                            )}
                        </div>

                        {mode === "signUp" && (
                            <p className="text-center text-xs text-[#627775]">
                                Password rule: at least 8 characters. By creating an account, you agree to our Terms of Service and Privacy Policy.
                            </p>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
};

function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.8H12z"
            />
            <path
                fill="#34A853"
                d="M2 12c0 1.6.4 3.1 1.2 4.4l3.4-2.6c-.2-.5-.4-1.1-.4-1.8s.1-1.2.4-1.8L3.2 7.6A9.9 9.9 0 0 0 2 12z"
            />
            <path
                fill="#4A90E2"
                d="M12 22c2.7 0 5-0.9 6.7-2.4l-3.2-2.6c-.9.6-2.1 1-3.5 1-2.6 0-4.8-1.8-5.6-4.1l-3.5 2.7C4.6 19.8 8 22 12 22z"
            />
            <path
                fill="#FBBC05"
                d="M6.4 13.9A6 6 0 0 1 6 12c0-.7.1-1.3.4-1.9L3 7.4A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.4l3.3-2.5z"
            />
        </svg>
    );
}

function Field({
    label,
    type = "text",
    value,
    onChange,
    placeholder,
    required = false,
    icon,
}: {
    label: string;
    type?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    required?: boolean;
    icon?: "mail" | "lock";
}) {
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-900">{label}</label>
            <div className="relative">
                {icon === "mail" && (
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#617977]">
                        <Mail size={15} />
                    </span>
                )}
                {icon === "lock" && (
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#617977]">
                        <Lock size={15} />
                    </span>
                )}
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    required={required}
                    className={`w-full rounded-xl border border-[#d9d4c9] bg-[#f7f4f0] py-2.5 text-sm text-[#062427] placeholder:text-[#6f8381] focus:outline-none focus:ring-2 focus:ring-[#d4ff3f]/55 ${icon ? "pl-11 pr-3.5" : "px-3.5"
                        }`}
                />
            </div>
        </div>
    );
}
