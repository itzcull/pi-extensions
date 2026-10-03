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
	it("includes the plan and email reported by the usage endpoint", async () => {
		const provider = createCodexProvider({
			get: async () => ({ plan_type: "pro", email: "person@example.com", rate_limit: null }),
		});
		expect(await provider.fetchUsage(codexToken, new AbortController().signal)).toMatchObject({
			plan: "pro",
			email: "person@example.com",
		});
	});

	it.each([null, 42, ""])(
		"keeps quota when optional account metadata is unavailable (%s)",
		async (value) => {
			const provider = createCodexProvider({
				get: async () => ({ plan_type: value, email: value, rate_limit: null }),
			});
			const usage = await provider.fetchUsage(codexToken, new AbortController().signal);
			expect(usage.windows).toEqual([]);
			expect(usage.plan).toBeUndefined();
			expect(usage.email).toBeUndefined();
		},
	);

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
	it.each([
		{ organization_type: "claude_max", rate_limit_tier: "default_claude_max_20x", plan: "max 20x" },
		{ organization_type: "claude_pro", rate_limit_tier: null, plan: "pro" },
	])(
		"includes the active OAuth account's email and plan ($plan)",
		async ({ plan, ...organization }) => {
			const requests: { url: string; headers: Record<string, string> }[] = [];
			const provider = createClaudeProvider({
				get: async (url, headers) => {
					requests.push({ url, headers });
					return url.endsWith("/profile")
						? { account: { email: "person@example.com" }, organization }
						: { five_hour: { utilization: 25 } };
				},
			});
			expect(await provider.fetchUsage("test-token", new AbortController().signal)).toEqual({
				windows: [{ label: "5h", remainingPercent: 75, resetsAt: null }],
				plan,
				email: "person@example.com",
			});
			expect(requests).toContainEqual({
				url: "https://api.anthropic.com/api/oauth/profile",
				headers: { Authorization: "Bearer test-token", "anthropic-beta": "oauth-2025-04-20" },
			});
		},
	);

	it.each(["unavailable", "malformed"])(
		"keeps quota when profile metadata is %s",
		async (profile) => {
			const provider = createClaudeProvider({
				get: async (url) => {
					if (url.endsWith("/profile")) {
						if (profile === "unavailable") throw new Error("Profile access denied");
						return { account: { email: 42 }, organization: null };
					}
					return { five_hour: { utilization: 25 } };
				},
			});
			expect(await provider.fetchUsage("test-token", new AbortController().signal)).toEqual({
				windows: [{ label: "5h", remainingPercent: 75, resetsAt: null }],
			});
		},
	);

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
