import type { Id } from "../../../convex/_generated/dataModel";

export type IntegrationLike = {
    _id: Id<"integrations">;
    name: string;
    type: string;
    config?: Record<string, string>;
    oauthStatus?: string;
    lastError?: string;
    lastSyncAt?: number;
};

export type GithubCredentialConfig = {
    server: string;
    user?: string;
    token: string;
    defaultRepo?: string;
};
