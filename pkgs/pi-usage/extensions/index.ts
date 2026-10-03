import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClaudeProvider } from "../src/providers/claude.ts";
import { createCodexProvider } from "../src/providers/codex.ts";
import { UsageMonitor } from "../src/usage-monitor.ts";
import { HttpUsageTransport } from "../src/usage-transport.ts";

const USAGE_KEY = "pi-usage";
const POLL_INTERVAL_MS = 5 * 60_000;

export default function usageExtension(pi: ExtensionAPI): void {
	const transport = new HttpUsageTransport();
	const providers = [createClaudeProvider(transport), createCodexProvider(transport)];
	let monitor: UsageMonitor | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let currentContext: ExtensionContext | undefined;
	let currentModel: ExtensionContext["model"];

	function update(ctx: ExtensionContext, model = ctx.model): Promise<void> {
		currentContext = ctx;
		currentModel = model;
		if (ctx.mode !== "tui" || !monitor) return Promise.resolve();
		return monitor.select(model?.provider, async () => {
			if (!model || !ctx.modelRegistry.isUsingOAuth(model)) return undefined;
			// Pi owns credential lookup and serialized OAuth refresh within the active profile.
			const result = await ctx.modelRegistry.getProviderAuth(model.provider);
			return result?.source === "OAuth" ? result.auth.apiKey : undefined;
		});
	}

	function stop(): void {
		if (timer) clearInterval(timer);
		timer = undefined;
		monitor?.stop();
		monitor = undefined;
		currentContext = undefined;
		currentModel = undefined;
	}

	pi.on("session_start", (_event, ctx) => {
		stop();
		if (ctx.mode !== "tui") return;
		// Clear the inline status used by older versions without replacing Pi's footer.
		ctx.ui.setStatus(USAGE_KEY, undefined);
		monitor = new UsageMonitor(providers, (text) =>
			currentContext?.ui.setWidget(USAGE_KEY, text === undefined ? undefined : [text], {
				placement: "aboveEditor",
			}),
		);
		void update(ctx);
		timer = setInterval(() => {
			if (currentContext) void update(currentContext, currentModel);
		}, POLL_INTERVAL_MS);
		timer.unref();
	});
	pi.on("model_select", (event, ctx) => {
		void update(ctx, event.model);
	});
	pi.on("agent_end", (_event, ctx) => {
		void update(ctx);
	});
	pi.on("session_shutdown", stop);

	pi.registerCommand("usage", {
		description: "Show subscription quota remaining and provider-reported reset times",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui" || !monitor) {
				if (ctx.hasUI)
					ctx.ui.notify("Subscription usage is available in interactive terminal mode.", "info");
				return;
			}
			const activeMonitor = monitor;
			await update(ctx);
			if (monitor === activeMonitor) ctx.ui.notify(activeMonitor.details(), "info");
		},
	});
}
