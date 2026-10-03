import type { UsageTransport } from "./usage.types.ts";

export class UsageRequestError extends Error {
	constructor(
		readonly status: number,
		readonly retryAfterMs = 0,
	) {
		super(
			status === 401 || status === 403
				? "Subscription access was denied. Check your subscription and /login again."
				: status === 429
					? "Usage endpoint rate limited. Retrying after the cooldown."
					: `Usage endpoint returned HTTP ${status}. Try /usage later.`,
		);
	}
}

function retryAfterMilliseconds(value: string | null): number {
	if (value === null) return 300_000;
	const seconds = Number(value);
	const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
	return Number.isFinite(delay) ? Math.max(60_000, delay) : 300_000;
}

export class HttpUsageTransport implements UsageTransport {
	constructor(private readonly timeoutMs = 10_000) {}

	async get(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
		const response = await fetch(url, {
			headers,
			signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]),
			redirect: "error",
		});
		if (!response.ok) {
			const retryAfterMs =
				response.status === 429 ? retryAfterMilliseconds(response.headers.get("retry-after")) : 0;
			await response.body?.cancel();
			throw new UsageRequestError(response.status, retryAfterMs);
		}
		return response.json();
	}
}
