import { Type } from "typebox";
import { Value } from "typebox/value";
import type {
	QuotaWindow,
	SubscriptionUsage,
	UsageProvider,
	UsageTransport,
} from "../usage.types.ts";

const WindowSchema = Type.Union([
	Type.Null(),
	Type.Object({
		utilization: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
		resets_at: Type.Optional(Type.Union([Type.String(), Type.Null()])),
	}),
]);
const UsageSchema = Type.Object({
	five_hour: Type.Optional(WindowSchema),
	seven_day: Type.Optional(WindowSchema),
	seven_day_sonnet: Type.Optional(WindowSchema),
	seven_day_opus: Type.Optional(WindowSchema),
});

const EmailSchema = Type.Object({
	account: Type.Object({ email: Type.String({ minLength: 1 }) }),
});
const PlanSchema = Type.Object({
	organization: Type.Object({ organization_type: Type.String({ minLength: 1 }) }),
});
const TierSchema = Type.Object({
	organization: Type.Object({ rate_limit_tier: Type.String({ minLength: 1 }) }),
});

async function fetchProfile(
	transport: UsageTransport,
	headers: Record<string, string>,
	signal: AbortSignal,
): Promise<Pick<SubscriptionUsage, "plan" | "email">> {
	try {
		const profile = await transport.get(
			"https://api.anthropic.com/api/oauth/profile",
			headers,
			signal,
		);
		const tier = Value.Check(TierSchema, profile)
			? profile.organization.rate_limit_tier
			: undefined;
		const multiplier = tier?.match(/^default_claude_max_(5|20)x$/)?.[1];
		const plan = multiplier
			? `max ${multiplier}x`
			: Value.Check(PlanSchema, profile)
				? profile.organization.organization_type.replace(/^claude_/, "")
				: undefined;
		return {
			...(plan ? { plan } : {}),
			...(Value.Check(EmailSchema, profile) ? { email: profile.account.email } : {}),
		};
	} catch {
		// Profile access is optional; never hide valid quota when metadata is unavailable.
		return {};
	}
}

export function createClaudeProvider(transport: UsageTransport): UsageProvider {
	return {
		id: "anthropic",
		label: "Claude",
		async fetchUsage(accessToken, signal) {
			const headers = {
				Authorization: `Bearer ${accessToken}`,
				"anthropic-beta": "oauth-2025-04-20",
			};
			const data = await transport.get(
				"https://api.anthropic.com/api/oauth/usage",
				headers,
				signal,
			);
			if (!Value.Check(UsageSchema, data)) throw new Error("Invalid Claude usage response");
			const windows: QuotaWindow[] = [];
			const entries = [
				["5h", data.five_hour],
				["7d", data.seven_day],
				["Sonnet 7d", data.seven_day_sonnet],
				["Opus 7d", data.seven_day_opus],
			] as const;
			for (const [label, window] of entries) {
				if (!window || window.utilization === null) continue;
				windows.push({
					label,
					remainingPercent: Math.max(0, 100 - window.utilization),
					resetsAt: window.resets_at ? new Date(window.resets_at).toISOString() : null,
				});
			}
			signal.throwIfAborted();
			return { windows, ...(await fetchProfile(transport, headers, signal)) };
		},
	};
}
