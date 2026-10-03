export type QuotaWindow = {
	label: string;
	remainingPercent: number;
	resetsAt: string | null;
};

export type SubscriptionUsage = {
	windows: readonly QuotaWindow[];
	limitReached?: boolean;
	plan?: string;
	email?: string;
};

export interface UsageProvider {
	id: string;
	label: string;
	fetchUsage(accessToken: string, signal: AbortSignal): Promise<SubscriptionUsage>;
}

/** The only network boundary used by provider adapters. */
export interface UsageTransport {
	get(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown>;
}
