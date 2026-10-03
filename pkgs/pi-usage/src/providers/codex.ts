import { Buffer } from "node:buffer";
import { Type } from "typebox";
import { Value } from "typebox/value";
import type { QuotaWindow, UsageProvider, UsageTransport } from "../usage.types.ts";

const ClaimsSchema = Type.Object({
	"https://api.openai.com/auth": Type.Object({ chatgpt_account_id: Type.String({ minLength: 1 }) }),
});
const WindowSchema = Type.Union([
	Type.Null(),
	Type.Object({
		used_percent: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
		limit_window_seconds: Type.Integer({ minimum: 1 }),
		reset_at: Type.Optional(
			Type.Union([Type.Integer({ minimum: 0, maximum: 8640000000000 }), Type.Null()]),
		),
	}),
]);
const UsageSchema = Type.Object({
	rate_limit: Type.Union([
		Type.Null(),
		Type.Object({
			allowed: Type.Optional(Type.Boolean()),
			limit_reached: Type.Optional(Type.Boolean()),
			primary_window: Type.Optional(WindowSchema),
			secondary_window: Type.Optional(WindowSchema),
		}),
	]),
});

function accountIdFromToken(token: string): string {
	// Decode only for account routing; the provider verifies the token, not this extension.
	try {
		const payload = token.split(".")[1];
		if (payload) {
			const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
			if (Value.Check(ClaimsSchema, claims))
				return claims["https://api.openai.com/auth"].chatgpt_account_id;
		}
	} catch {
		// Never expose a token or decoded payload in errors.
	}
	throw new Error("Codex account information is unavailable");
}

function windowLabel(seconds: number): string {
	if (seconds % 86400 === 0) return `${seconds / 86400}d`;
	if (seconds % 3600 === 0) return `${seconds / 3600}h`;
	if (seconds % 60 === 0) return `${seconds / 60}m`;
	return `${seconds}s`;
}

export function createCodexProvider(transport: UsageTransport): UsageProvider {
	return {
		id: "openai-codex",
		label: "Codex",
		async fetchUsage(accessToken, signal) {
			const data = await transport.get(
				"https://chatgpt.com/backend-api/wham/usage",
				{
					Authorization: `Bearer ${accessToken}`,
					"ChatGPT-Account-Id": accountIdFromToken(accessToken),
				},
				signal,
			);
			if (!Value.Check(UsageSchema, data)) throw new Error("Invalid Codex usage response");
			const windows: QuotaWindow[] = [];
			for (const window of [data.rate_limit?.primary_window, data.rate_limit?.secondary_window]) {
				if (!window || window.used_percent === null) continue;
				windows.push({
					label: windowLabel(window.limit_window_seconds),
					remainingPercent: Math.max(0, 100 - window.used_percent),
					resetsAt: window.reset_at == null ? null : new Date(window.reset_at * 1000).toISOString(),
				});
			}
			return {
				windows,
				limitReached: data.rate_limit?.allowed === false || data.rate_limit?.limit_reached === true,
			};
		},
	};
}
