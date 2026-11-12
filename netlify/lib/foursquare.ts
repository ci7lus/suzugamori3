export const callbackPath = "/.netlify/functions/swarm-callback";

export async function exchangeCode(
	code: string,
	redirectUri: string,
): Promise<string> {
	const clientId = process.env.FOURSQUARE_CLIENT_ID;
	const clientSecret = process.env.FOURSQUARE_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error("Missing Foursquare OAuth configuration");
	}

	const url = new URL("https://foursquare.com/oauth2/access_token");
	url.search = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: "authorization_code",
		redirect_uri: redirectUri,
		code,
	}).toString();

	const response = await fetch(url, {
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error("Foursquare token exchange failed");
	}

	const payload: unknown = await response.json();
	if (
		typeof payload === "object" &&
		payload !== null &&
		"access_token" in payload &&
		typeof payload.access_token === "string" &&
		/^[!-~]+$/.test(payload.access_token)
	) {
		return payload.access_token;
	}
	throw new Error("Invalid Foursquare token response");
}
