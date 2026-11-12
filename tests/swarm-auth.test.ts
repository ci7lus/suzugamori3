import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import callback from "../netlify/functions/swarm-callback.ts";
import login from "../netlify/functions/swarm-login.ts";

const origin = "https://example.test";
const functions = `${origin}/.netlify/functions`;
const callbackUrl = `${functions}/swarm-callback`;
const token = "test</script><script>token";

process.env.APP_ORIGIN = origin;
process.env.FOURSQUARE_CLIENT_ID = "test-client";
process.env.FOURSQUARE_CLIENT_SECRET = "test-secret";

function cookiePair(cookie: string): string {
	return cookie.split(";")[0];
}

async function startLogin() {
	const response = await login(new Request(`${functions}/swarm-login`));
	const location = response.headers.get("location");
	const [cookie] = response.headers.getSetCookie();
	assert.ok(location);
	assert.ok(cookie);
	const authorize = new URL(location);
	const state = authorize.searchParams.get("state");
	assert.ok(state);
	return { response, authorize, cookie, state };
}

test("login starts authorization", async () => {
	const { response, authorize, cookie, state } = await startLogin();
	assert.equal(response.status, 302);
	assert.equal(
		authorize.origin + authorize.pathname,
		"https://foursquare.com/oauth2/authenticate",
	);
	assert.equal(authorize.searchParams.get("redirect_uri"), callbackUrl);
	assert.equal(authorize.searchParams.get("response_type"), "code");
	assert.ok(cookiePair(cookie).endsWith(`=${state}`));
	assert.match(cookie, /HttpOnly/);
	assert.match(cookie, /Secure/);
	assert.match(cookie, /SameSite=Lax/);
	assert.match(cookie, /Max-Age=600/);
	assert.notEqual((await startLogin()).state, state);
});

test("callback stores the token before replacing the URL", async (t) => {
	const { cookie, state } = await startLogin();
	const exchange = t.mock.method(globalThis, "fetch", async (input: URL) => {
		assert.equal(
			input.origin + input.pathname,
			"https://foursquare.com/oauth2/access_token",
		);
		assert.equal(input.searchParams.get("code"), "test-code");
		assert.equal(input.searchParams.get("redirect_uri"), callbackUrl);
		return Response.json({ access_token: token });
	});
	const response = await callback(
		new Request(`${callbackUrl}?code=test-code&state=${state}`, {
			headers: { cookie: cookiePair(cookie) },
		}),
	);
	assert.equal(exchange.mock.callCount(), 1);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("location"), null);
	assert.equal(response.headers.get("cache-control"), "no-store");
	assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
	const [stateCookie, ...otherCookies] = response.headers.getSetCookie();
	assert.match(stateCookie, /Max-Age=0/);
	assert.equal(otherCookies.length, 0);
	const html = await response.text();
	const scripts = Array.from(
		html.matchAll(/<script nonce="([^"]+)">([\s\S]*?)<\/script>/g),
	);
	assert.equal(scripts.length, 1);
	assert.doesNotMatch(html, /<script>token/);
	const [, nonce, script] = scripts[0];
	assert.ok(
		response.headers
			.get("content-security-policy")
			?.includes(`'nonce-${nonce}'`),
	);

	const actions: unknown[] = [];
	runInNewContext(script, {
		localStorage: {
			setItem: (key: string, value: string) => actions.push([key, value]),
		},
		location: { replace: (path: string) => actions.push(path) },
	});
	assert.deepEqual(actions, [["suzugamori3.swarm.accessToken", token], "/"]);

	runInNewContext(script, {
		localStorage: {
			setItem: () => {
				throw new Error("Storage blocked");
			},
		},
		location: { replace: (path: string) => actions.push(path) },
	});
	assert.equal(actions.at(-1), "/?login=failed");
});

test("callback rejects absent, mismatched and duplicate state", async (t) => {
	const { cookie, state } = await startLogin();
	const exchange = t.mock.method(globalThis, "fetch");
	const cases = [
		{ query: state, headers: {} },
		{ query: "wrong", headers: { cookie: cookiePair(cookie) } },
		{
			query: `${state}&state=${state}`,
			headers: { cookie: cookiePair(cookie) },
		},
	];
	for (const { query, headers } of cases) {
		const response = await callback(
			new Request(`${callbackUrl}?code=test-code&state=${query}`, { headers }),
		);
		assert.equal(response.headers.get("location"), `${origin}/?login=failed`);
		assert.equal(response.headers.getSetCookie().length, 1);
	}
	assert.equal(exchange.mock.callCount(), 0);
});

test("callback reports cancellation and exchange failure", async (t) => {
	const { cookie, state } = await startLogin();
	const exchange = t.mock.method(globalThis, "fetch", async () =>
		Response.json({}, { status: 400 }),
	);
	const headers = { cookie: cookiePair(cookie) };
	const denied = await callback(
		new Request(`${callbackUrl}?error=access_denied&state=${state}`, {
			headers,
		}),
	);
	assert.equal(denied.status, 303);
	assert.equal(denied.headers.get("location"), `${origin}/?login=cancelled`);
	assert.equal(exchange.mock.callCount(), 0);

	const failed = await callback(
		new Request(`${callbackUrl}?code=test-code&state=${state}`, { headers }),
	);
	assert.equal(failed.status, 303);
	assert.equal(failed.headers.get("location"), `${origin}/?login=failed`);
	assert.equal(exchange.mock.callCount(), 1);
	for (const response of [denied, failed]) {
		assert.equal(response.headers.getSetCookie().length, 1);
		assert.match(response.headers.getSetCookie()[0], /Max-Age=0/);
	}
});
