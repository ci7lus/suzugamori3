export const callbackPath = "/.netlify/functions/swarm-callback";

function stateCookieName(secure: boolean): string {
	return secure ? "__Host-swarm_oauth_state" : "swarm_oauth_state";
}

export function stateCookie(
	state: string,
	secure: boolean,
	maxAge: number,
): string {
	return `${stateCookieName(secure)}=${state}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function readStateCookie(
	cookies: string,
	secure: boolean,
): string | undefined {
	const prefix = `${stateCookieName(secure)}=`;
	return cookies
		.split(";")
		.map((cookie) => cookie.trim())
		.find((cookie) => cookie.startsWith(prefix))
		?.slice(prefix.length);
}
