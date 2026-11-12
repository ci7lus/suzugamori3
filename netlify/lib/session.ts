import { appOrigin } from "./http.ts";

const stateAge = 10 * 60;

function cookieName(name: string): string {
	return appOrigin().startsWith("https:") ? `__Host-${name}` : name;
}

function cookie(name: string, value: string, maxAge: number): string {
	const secure = appOrigin().startsWith("https:") ? "; Secure" : "";
	return (
		cookieName(name) +
		"=" +
		value +
		"; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
		maxAge +
		secure
	);
}

function readCookie(request: Request, name: string): string | undefined {
	const prefix = `${cookieName(name)}=`;
	return request.headers
		.get("cookie")
		?.split(";")
		.map((value) => value.trim())
		.find((value) => value.startsWith(prefix))
		?.slice(prefix.length);
}

export function createStateCookie(state: string): string {
	return cookie("swarm_state", state, stateAge);
}

export function readStateCookie(request: Request): string | undefined {
	return readCookie(request, "swarm_state");
}

export function clearStateCookie(): string {
	return cookie("swarm_state", "", 0);
}
