import { describe, expect, it } from "vitest";
import { UsageMonitor } from "../src/usage-monitor.ts";
import { UsageRequestError } from "../src/usage-transport.ts";
import type { UsageProvider } from "../src/usage.types.ts";

const provider: UsageProvider = {
	id: "example",
	label: "Example",
	fetchUsage: async () => ({
		windows: [
			{ label: "5h", remainingPercent: 74.8, resetsAt: "2026-09-06T18:00:00.000Z" },
			{ label: "7d", remainingPercent: 20, resetsAt: null },
		],
	}),
};

describe("subscription quota display", () => {
	it.each([
		{
			name: "unsupported provider",
			id: "other",
			token: "test",
			fetchUsage: provider.fetchUsage,
			detail: "Subscription quota is not supported for this provider.",
		},
		{
			name: "API key or missing login",
			id: "example",
			token: undefined,
			fetchUsage: provider.fetchUsage,
			detail: "Subscription login required. Use /login for this provider.",
		},
		{
			name: "network failure",
			id: "example",
			token: "test",
			fetchUsage: async () => {
				throw new Error("secret-token must not appear");
			},
			detail: "Could not retrieve subscription quota. Try /usage later.",
		},
		{
			name: "no reported quota",
			id: "example",
			token: "test",
			fetchUsage: async () => ({ windows: [] }),
			detail: "The provider did not report any quota windows.",
		},
	])(
		"shows unavailable rather than an invented percentage for $name",
		async ({ id, token, fetchUsage, detail }) => {
			const statuses: (string | undefined)[] = [];
			const monitor = new UsageMonitor([{ ...provider, fetchUsage }], (text: string | undefined) =>
				statuses.push(text),
			);
			await monitor.select(id, async () => token);
			expect(statuses.at(-1)).toMatch(/unavailable/);
			expect(statuses.at(-1)).not.toContain("%");
			expect(monitor.details()).toBe(detail);
		},
	);

	it("shows a provider-reported limit even when its window percentage has not reached zero", async () => {
		const statuses: (string | undefined)[] = [];
		const blocked: UsageProvider = {
			...provider,
			fetchUsage: async () => ({
				windows: [{ label: "5h", remainingPercent: 10, resetsAt: null }],
				limitReached: true,
			}),
		};
		const monitor = new UsageMonitor([blocked], (text: string | undefined) => statuses.push(text));
		await monitor.select("example", async () => "test");
		expect(statuses.at(-1)).toBe("Example: 5h 10% left (limit reached)");
		expect(monitor.details()).toContain("Provider reports a subscription limit has been reached.");
	});

	it("honors rate-limit cooldowns even when switching away and back", async () => {
		const start = Date.parse("2026-09-06T14:00:00.000Z");
		let now = start;
		let limited = true;
		const limitedProvider: UsageProvider = {
			...provider,
			fetchUsage: async () => {
				if (limited) throw new UsageRequestError(429, 600_000);
				return provider.fetchUsage("test", new AbortController().signal);
			},
		};
		const statuses: (string | undefined)[] = [];
		const monitor = new UsageMonitor(
			[limitedProvider],
			(text: string | undefined) => statuses.push(text),
			() => now,
		);
		await monitor.select("example", async () => "test");
		limited = false;
		now = start + 60_000;
		await monitor.select("other", async () => "test");
		await monitor.select("example", async () => "test");
		expect(statuses.at(-1)).toContain("unavailable");
		expect(monitor.details()).toContain("rate limited");
		now = start + 600_000;
		await monitor.select("example", async () => "test");
		expect(statuses.at(-1)).toBe("Example: 5h (resets in 0d 3h) 74% left · 7d 20% left");
	});

	it("clears the footer on shutdown and ignores pending quota responses", async () => {
		let release: ((token: string) => void) | undefined;
		const token = new Promise<string>((resolve) => {
			release = resolve;
		});
		const statuses: (string | undefined)[] = [];
		const monitor = new UsageMonitor([provider], (text: string | undefined) => statuses.push(text));
		const pending = monitor.select("example", () => token);
		expect(statuses.at(-1)).toBe("Example: quota loading…");
		monitor.stop();
		release?.("test");
		await pending;
		expect(statuses.at(-1)).toBeUndefined();
	});

	it("shares pending and recent readings, then refreshes quota after a minute", async () => {
		let now = 0;
		let reads = 0;
		const statuses: (string | undefined)[] = [];
		const changingProvider: UsageProvider = {
			...provider,
			fetchUsage: async () => ({
				windows: [{ label: "5h", remainingPercent: 100 - ++reads, resetsAt: null }],
			}),
		};
		const monitor = new UsageMonitor(
			[changingProvider],
			(text: string | undefined) => statuses.push(text),
			() => now,
		);
		await Promise.all([
			monitor.select("example", async () => "test"),
			monitor.select("example", async () => "test"),
		]);
		await monitor.select("example", async () => "test");
		expect(statuses.at(-1)).toBe("Example: 5h 99% left");
		now = 60_000;
		await monitor.select("example", async () => "test");
		expect(statuses.at(-1)).toBe("Example: 5h 98% left");
	});

	it("does not let a late response overwrite the newly selected provider", async () => {
		let release: ((token: string) => void) | undefined;
		const token = new Promise<string>((resolve) => {
			release = resolve;
		});
		const statuses: (string | undefined)[] = [];
		const monitor = new UsageMonitor([provider], (text: string | undefined) => statuses.push(text));
		const oldRequest = monitor.select("example", () => token);
		await monitor.select("other", async () => undefined);
		release?.("test-token");
		await oldRequest;
		expect(statuses.at(-1)).toBe("Usage: quota unavailable");
		expect(monitor.details()).toBe("Subscription quota is not supported for this provider.");
	});

	it.each([
		{ resetsAt: "2026-09-08T17:59:00.000Z", countdown: "2d 3h" },
		{ resetsAt: "2026-09-06T18:00:00.000Z", countdown: "0d 4h" },
		{ resetsAt: "2026-09-06T14:30:00.000Z", countdown: "0d 0h" },
		{ resetsAt: "2026-09-06T14:00:00.000Z", countdown: "0d 0h" },
		{ resetsAt: "2026-09-05T14:00:00.000Z", countdown: "0d 0h" },
	])(
		"shows time until reset as days and whole hours ($countdown)",
		async ({ resetsAt, countdown }) => {
			const statuses: (string | undefined)[] = [];
			const monitor = new UsageMonitor(
				[
					{
						...provider,
						fetchUsage: async () => ({
							windows: [{ label: "5h", remainingPercent: 74, resetsAt }],
						}),
					},
				],
				(text) => statuses.push(text),
				() => Date.parse("2026-09-06T14:00:00.000Z"),
			);
			await monitor.select("example", async () => "test");
			expect(statuses.at(-1)).toBe(`Example: 5h (resets in ${countdown}) 74% left`);
		},
	);

	it.each([
		{
			metadata: { plan: "pro", email: "person@example.com" },
			prefix: "Example (Pro, person@example.com)",
		},
		{ metadata: { plan: "max 20x" }, prefix: "Example (Max 20x)" },
		{ metadata: { email: "person@example.com" }, prefix: "Example (person@example.com)" },
		{ metadata: {}, prefix: "Example" },
	])(
		"prefixes quota with the provider and available account information ($prefix)",
		async ({ metadata, prefix }) => {
			const statuses: (string | undefined)[] = [];
			const monitor = new UsageMonitor(
				[
					{
						...provider,
						fetchUsage: async () => ({
							...metadata,
							windows: [{ label: "5h", remainingPercent: 74, resetsAt: null }],
						}),
					},
				],
				(text) => statuses.push(text),
			);
			await monitor.select("example", async () => "test");
			expect(statuses.at(-1)).toBe(`${prefix}: 5h 74% left`);
			expect(monitor.details()).toContain(`${prefix} subscription quota`);
		},
	);

	it("shows remaining quota and reset countdowns while retaining exact reset times in details", async () => {
		const statuses: (string | undefined)[] = [];
		const monitor = new UsageMonitor(
			[provider],
			(text: string | undefined) => statuses.push(text),
			() => Date.parse("2026-09-06T14:00:00.000Z"),
		);
		await monitor.select("example", async () => "test-token");
		expect(statuses.at(-1)).toBe("Example: 5h (resets in 0d 4h) 74% left · 7d 20% left");
		expect(monitor.details()).toBe(
			[
				"Example subscription quota",
				"5h: 74% remaining — resets 2026-09-06T18:00:00.000Z",
				"7d: 20% remaining — reset time unavailable",
				"Updated: 2026-09-06T14:00:00.000Z",
			].join("\n"),
		);
	});
});
