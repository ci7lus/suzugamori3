export const noStore = { "Cache-Control": "no-store" };

export function methodNotAllowed(allow: string): Response {
	return new Response(null, {
		status: 405,
		headers: { ...noStore, Allow: allow },
	});
}

export function appOrigin(): string {
	const url = new URL(process.env.APP_ORIGIN ?? "");
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (
		(url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new Error("Invalid APP_ORIGIN");
	}
	return url.origin;
}
