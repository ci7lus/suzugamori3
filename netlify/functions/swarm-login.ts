import { randomBytes } from "node:crypto";
import { callbackPath } from "../lib/foursquare.ts";
import { appOrigin, methodNotAllowed, noStore } from "../lib/http.ts";
import { createStateCookie } from "../lib/session.ts";

export default async function login(request: Request): Promise<Response> {
	if (request.method !== "GET") {
		return methodNotAllowed("GET");
	}

	try {
		const clientId = process.env.FOURSQUARE_CLIENT_ID;
		if (!clientId) {
			throw new Error("Missing FOURSQUARE_CLIENT_ID");
		}
		const state = randomBytes(32).toString("base64url");
		const authorize = new URL("https://foursquare.com/oauth2/authenticate");
		authorize.search = new URLSearchParams({
			client_id: clientId,
			response_type: "code",
			redirect_uri: appOrigin() + callbackPath,
			state,
		}).toString();

		return new Response(null, {
			status: 302,
			headers: {
				...noStore,
				Location: authorize.href,
				"Referrer-Policy": "no-referrer",
				"Set-Cookie": createStateCookie(state),
			},
		});
	} catch (e) {
		console.error(e);
		return new Response("Swarmログインの設定を確認してください。", {
			status: 503,
			headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
		});
	}
}
