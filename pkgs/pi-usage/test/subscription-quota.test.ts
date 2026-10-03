import { describe, expect, it } from "vitest";
import { createClaudeProvider } from "../src/providers/claude.ts";
import { createCodexProvider } from "../src/providers/codex.ts";
import type { UsageTransport } from "../src/usage.types.ts";

const codexToken = `header.${btoa(
	JSON.stringify({
		"https://api.openai.com/auth": { chatgpt_account_id: "test-account" },
	}),
)}.signature`;

describe("Codex subscription quota", () => {
	it.each([undefined, "many", -1, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects invalid quota values (%s) rather than displaying a percentage",
		async (used_percent) => {
			const provider = createCodexProvider({
				get: async () => ({
					rate_limit: { primary_window: { used_percent, limit_window_seconds: 18000 } },
				}),
			});
			await expect(provider.fetchUsage(codexToken, new AbortController().signal)).rejects.toThrow(
				"Invalid Codex usage response",
			);
		},
	);

	it("reports both windows and clamps over-quota usage to zero remaining", async () => {
		const provider = createCodexProvider({
			get: async () => ({
				rate_limit: {
					primary_window: { used_percent: 110, limit_window_seconds: 18000, reset_at: null },
					secondary_window: { used_percent: 25.5, limit_window_seconds: 604800 },
				},
			}),
		});
		expect(await provider.fetchUsage(codexToken, new AbortController().signal)).toEqual({
			windows: [
				{ label: "5h", remainingPercent: 0, resetsAt: null },
				{ label: "7d", remainingPercent: 74.5, resetsAt: null },
			],
			limitReached: false,
		});
	});

	it("uses the account's reported window duration, not its primary or secondary position", async () => {
		const requests: { url: string; headers: Record<string, string> }[] = [];
		const transport: UsageTransport = {
			get: async (url, headers) => {
				requests.push({ url, headers });
				return {
					rate_limit: {
						allowed: false,
						limit_reached: true,
						primary_window: {
							used_percent: 100,
							limit_window_seconds: 604800,
							reset_at: 1788717600,
						},
						secondary_window: null,
					},
				};
			},
		};
		expect(
			await createCodexProvider(transport).fetchUsage(codexToken, new AbortController().signal),
		).toEqual({
			windows: [{ label: "7d", remainingPercent: 0, resetsAt: "2026-09-06T18:00:00.000Z" }],
			limitReached: true,
		});
		expect(requests).toEqual([
			{
				url: "https://chatgpt.com/backend-api/wham/usage",
				headers: { Authorization: `Bearer ${codexToken}`, "ChatGPT-Account-Id": "test-account" },
			},
		]);
	});
});

describe("Claude subscription quota", () => {
	it.each([undefined, "many", -1, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects invalid quota values (%s) rather than displaying a percentage",
		async (utilization) => {
			const provider = createClaudeProvider({ get: async () => ({ five_hour: { utilization } }) });
			await expect(provider.fetchUsage("test-token", new AbortController().signal)).rejects.toThrow(
				"Invalid Claude usage response",
			);
		},
	);

	it("omits untracked windows rather than treating them as unused quota", async () => {
		const provider = createClaudeProvider({
			get: async () => ({ five_hour: null, seven_day: { utilization: null, resets_at: null } }),
		});
		expect(await provider.fetchUsage("test-token", new AbortController().signal)).toEqual({
			windows: [],
		});
	});

	it("reports remaining quota and reset times for each available window", async () => {
		const provider = createClaudeProvider({
			get: async () => ({
				five_hour: { utilization: 25, resets_at: "2026-09-06T18:00:00Z" },
				seven_day: { utilization: 80, resets_at: null },
				seven_day_sonnet: { utilization: 10, resets_at: "2026-09-10T18:00:00Z" },
				seven_day_opus: null,
			}),
		});

		expect(await provider.fetchUsage("test-token", new AbortController().signal)).toEqual({
			windows: [
				{ label: "5h", remainingPercent: 75, resetsAt: "2026-09-06T18:00:00.000Z" },
				{ label: "7d", remainingPercent: 20, resetsAt: null },
				{ label: "Sonnet 7d", remainingPercent: 90, resetsAt: "2026-09-10T18:00:00.000Z" },
			],
		});
	});
});
