import { Type } from "typebox";
import { Value } from "typebox/value";
import type { QuotaWindow, UsageProvider, UsageTransport } from "../usage.types.ts";

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

export function createClaudeProvider(transport: UsageTransport): UsageProvider {
	return {
		id: "anthropic",
		label: "Claude",
		async fetchUsage(accessToken, signal) {
			const data = await transport.get(
				"https://api.anthropic.com/api/oauth/usage",
				{
					Authorization: `Bearer ${accessToken}`,
					"anthropic-beta": "oauth-2025-04-20",
				},
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
			return { windows };
		},
	};
}
