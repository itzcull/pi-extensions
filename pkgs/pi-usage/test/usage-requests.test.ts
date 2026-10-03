import { createServer, type RequestListener } from "node:http";
import { describe, expect, it } from "vitest";
import { HttpUsageTransport } from "../src/usage-transport.ts";

async function withServer(
	handler: RequestListener,
	run: (url: string) => Promise<void>,
): Promise<void> {
	const server = createServer(handler);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Expected TCP test server");
	try {
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
}

describe("usage endpoint requests", () => {
	it("times out when an endpoint never finishes its response", async () => {
		await withServer(
			(_request, response) => {
				response.writeHead(200, { "content-type": "application/json" });
				response.write("{");
			},
			async (url) => {
				await expect(
					new HttpUsageTransport(25).get(url, {}, new AbortController().signal),
				).rejects.toThrow();
			},
		);
	}, 500);

	it("does not follow redirects with subscription credentials", async () => {
		await withServer(
			(request, response) => {
				if (request.url === "/") {
					response.writeHead(302, { location: "/unexpected" });
					response.end();
				} else {
					response.end("{}");
				}
			},
			async (url) => {
				await expect(
					new HttpUsageTransport().get(
						url,
						{ Authorization: "Bearer test" },
						new AbortController().signal,
					),
				).rejects.toThrow();
			},
		);
	});

	it.each([401, 403, 429, 500])(
		"rejects HTTP %s without exposing the response body",
		async (status) => {
			await withServer(
				(_request, response) => {
					response.writeHead(status, { "retry-after": "600" });
					response.end(JSON.stringify({ secret: "private account details" }));
				},
				async (url) => {
					await expect(
						new HttpUsageTransport().get(url, {}, new AbortController().signal),
					).rejects.toMatchObject({
						status,
						retryAfterMs: status === 429 ? 600_000 : 0,
					});
				},
			);
		},
	);

	it("retrieves quota JSON with the provider's authentication headers", async () => {
		await withServer(
			(request, response) => {
				expect(request.headers.authorization).toBe("Bearer test-token");
				response.setHeader("content-type", "application/json");
				response.end(JSON.stringify({ five_hour: { utilization: 30 } }));
			},
			async (url) => {
				expect(
					await new HttpUsageTransport().get(
						url,
						{ Authorization: "Bearer test-token" },
						new AbortController().signal,
					),
				).toEqual({ five_hour: { utilization: 30 } });
			},
		);
	});
});
