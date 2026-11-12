import {
	callbackPath,
	readStateCookie,
	stateCookie,
} from "../shared/swarm-oauth.ts";

export function prepareSwarmLogin(
	clientId: string | undefined,
	origin: string,
	browser: { cookie: string },
): URL {
	if (!clientId) {
		throw new Error("Missing VITE_FOURSQUARE_CLIENT_ID");
	}
	const callback = new URL(callbackPath, origin);
	const secure = callback.protocol === "https:";
	const randomBytes = crypto.getRandomValues(new Uint8Array(32));
	const state = Array.from(randomBytes, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	browser.cookie = stateCookie(state, secure, 600);
	if (readStateCookie(browser.cookie, secure) !== state) {
		throw new Error("Could not save OAuth state");
	}

	const authorize = new URL("https://foursquare.com/oauth2/authenticate");
	authorize.search = new URLSearchParams({
		client_id: clientId,
		response_type: "code",
		redirect_uri: callback.href,
		state,
	}).toString();
	return authorize;
}
