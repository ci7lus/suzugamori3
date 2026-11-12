import { randomBytes } from "node:crypto";
import { accessTokenStorageKey } from "../../shared/swarm.ts";
import { callbackPath, exchangeCode } from "../lib/foursquare.ts";
import { appOrigin, methodNotAllowed, noStore } from "../lib/http.ts";
import { clearStateCookie, readStateCookie } from "../lib/session.ts";

function completeLogin(accessToken: string, headers: Headers): Response {
	const nonce = randomBytes(16).toString("base64");
	// Escape HTML delimiters even when they occur inside a JavaScript string.
	const token = JSON.stringify(accessToken).replaceAll("<", "\\u003c");
	headers.set("Content-Type", "text/html; charset=utf-8");
	headers.set(
		"Content-Security-Policy",
		`default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
	);

	return new Response(
		`<!doctype html>
<html lang="ja">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Swarmログイン</title>
</head>
<body>
	<p>Swarmにログインしています…</p>
	<noscript>ログインを完了するにはJavaScriptを有効にしてください。</noscript>
	<script nonce="${nonce}">
		try {
			localStorage.setItem(${JSON.stringify(accessTokenStorageKey)}, ${token});
			location.replace("/");
		} catch {
			location.replace("/?login=failed");
		}
	</script>
</body>
</html>`,
		{ headers },
	);
}

export default async function callback(request: Request): Promise<Response> {
	if (request.method !== "GET") {
		return methodNotAllowed("GET");
	}

	let origin: string;
	try {
		origin = appOrigin();
	} catch {
		return new Response(null, { status: 503, headers: noStore });
	}
	const location = new URL("/", origin);
	const headers = new Headers({ ...noStore, "Referrer-Policy": "no-referrer" });
	headers.append("Set-Cookie", clearStateCookie());

	const query = new URL(request.url).searchParams;
	const states = query.getAll("state");
	const codes = query.getAll("code");
	const errors = query.getAll("error");

	if (
		states.length !== 1 ||
		!states[0] ||
		states[0] !== readStateCookie(request)
	) {
		location.searchParams.set("login", "failed");
	} else if (
		errors.length === 1 &&
		errors[0] === "access_denied" &&
		codes.length === 0
	) {
		location.searchParams.set("login", "cancelled");
	} else if (errors.length === 0 && codes.length === 1 && codes[0]) {
		try {
			const accessToken = await exchangeCode(codes[0], origin + callbackPath);
			return completeLogin(accessToken, headers);
		} catch {
			location.searchParams.set("login", "failed");
		}
	} else {
		location.searchParams.set("login", "failed");
	}

	headers.set("Location", location.href);
	return new Response(null, { status: 303, headers });
}
