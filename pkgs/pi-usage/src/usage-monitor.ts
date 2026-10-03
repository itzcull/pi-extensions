import { UsageRequestError } from "./usage-transport.ts";
import type { SubscriptionUsage, UsageProvider } from "./usage.types.ts";

export class UsageMonitor {
	private detailText = "Usage unavailable";
	private request: AbortController | undefined;
	private providerId: string | undefined;
	private pending: Promise<void> | undefined;
	private nextRefreshAt = 0;
	private readonly retryAt = new Map<string, number>();

	constructor(
		private readonly providers: readonly UsageProvider[],
		private readonly setStatus: (text: string | undefined) => void,
		private readonly now: () => number = Date.now,
	) {}

	async select(
		providerId: string | undefined,
		getToken: () => Promise<string | undefined>,
	): Promise<void> {
		if (this.providerId === providerId) {
			if (this.pending) return this.pending;
			if (this.now() < this.nextRefreshAt) return;
		}
		this.request?.abort();
		const request = new AbortController();
		this.request = request;
		this.providerId = providerId;
		this.nextRefreshAt = this.now() + 60_000;
		const provider = this.providers.find((candidate) => candidate.id === providerId);
		if (!provider) {
			this.pending = undefined;
			this.unavailable("Usage", "Subscription quota is not supported for this provider.");
			return;
		}
		const retryAt = this.retryAt.get(provider.id) ?? 0;
		if (this.now() < retryAt) {
			this.pending = undefined;
			this.nextRefreshAt = retryAt;
			this.unavailable(provider.label, "Usage endpoint rate limited. Retrying after the cooldown.");
			return;
		}
		this.setStatus(`${provider.label}: quota loading…`);
		this.detailText = "Loading subscription quota…";
		this.pending = this.load(provider, getToken, request);
		try {
			await this.pending;
		} finally {
			if (this.request === request) this.pending = undefined;
		}
	}

	private async load(
		provider: UsageProvider,
		getToken: () => Promise<string | undefined>,
		request: AbortController,
	): Promise<void> {
		try {
			const token = await getToken();
			if (request.signal.aborted) return;
			if (!token) {
				this.unavailable(
					provider.label,
					"Subscription login required. Use /login for this provider.",
				);
				return;
			}
			const usage = await provider.fetchUsage(token, request.signal);
			if (request.signal.aborted) return;
			if (usage.windows.length === 0) {
				this.unavailable(provider.label, "The provider did not report any quota windows.");
				return;
			}
			this.publish(provider, usage);
		} catch (error) {
			if (request.signal.aborted) return;
			if (error instanceof UsageRequestError) {
				this.nextRefreshAt = Math.max(this.nextRefreshAt, this.now() + error.retryAfterMs);
				if (error.status === 429) this.retryAt.set(provider.id, this.nextRefreshAt);
				this.unavailable(provider.label, error.message);
				return;
			}
			this.unavailable(provider.label, "Could not retrieve subscription quota. Try /usage later.");
		}
	}

	private unavailable(label: string, reason: string): void {
		this.setStatus(`${label}: quota unavailable`);
		this.detailText = reason;
	}

	private publish(provider: UsageProvider, usage: SubscriptionUsage): void {
		const now = this.now();
		const plan = usage.plan?.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
		const account = [plan, usage.email].filter(Boolean).join(", ");
		const label = `${provider.label}${account ? ` (${account})` : ""}`;
		const windows = usage.windows.map((window) => {
			const remaining = `${Math.floor(window.remainingPercent)}% left`;
			if (!window.resetsAt) return `${window.label} ${remaining}`;
			const hours = Math.max(0, Math.floor((Date.parse(window.resetsAt) - now) / 3_600_000));
			return `${window.label} (resets in ${Math.floor(hours / 24)}d ${hours % 24}h) ${remaining}`;
		});
		this.setStatus(
			`${label}: ${windows.join(" · ")}${usage.limitReached ? " (limit reached)" : ""}`,
		);
		this.detailText = [
			`${label} subscription quota`,
			...(usage.limitReached ? ["Provider reports a subscription limit has been reached."] : []),
			...usage.windows.map(
				(window) =>
					`${window.label}: ${Math.floor(window.remainingPercent)}% remaining — ${window.resetsAt ? `resets ${window.resetsAt}` : "reset time unavailable"}`,
			),
			`Updated: ${new Date(now).toISOString()}`,
		].join("\n");
	}

	stop(): void {
		this.request?.abort();
		this.request = undefined;
		this.pending = undefined;
		this.providerId = undefined;
		this.nextRefreshAt = 0;
		this.detailText = "Usage unavailable";
		this.setStatus(undefined);
	}

	details(): string {
		return this.detailText;
	}
}
