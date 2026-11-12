import assert from "node:assert/strict";
import { test } from "node:test";
import {
	fetchCheckinShareLink,
	fetchCheckins,
	SwarmRequestError,
} from "../src/swarm-api.ts";

const id = "59b97e2a0d173f01fd48252e";
const url = `https://www.swarmapp.com/user/123456/checkin/${id}?s=example`;
const accessToken = "test-token";

function historyResult(items: unknown[]): Response {
	return Response.json({
		meta: { code: 200 },
		response: { checkins: { items } },
	});
}

function detailResult(checkin: unknown): Response {
	return Response.json({ meta: { code: 200 }, response: { checkin } });
}

test("history uses the same-origin proxy and returns the latest twenty", async (t) => {
	const items = Array.from({ length: 22 }, (_, index) => ({
		id: String(index),
		createdAt: index,
	}));
	const upstream = t.mock.method(
		globalThis,
		"fetch",
		async (request: string, init: RequestInit) => {
			assert.equal(request, "/api/swarm/checkins?v=20240109&limit=20&offset=0");
			assert.equal(
				new Headers(init.headers).get("authorization"),
				"Bearer test-token",
			);
			assert.equal(init.credentials, "omit");
			assert.equal(init.cache, "no-store");
			return historyResult([
				...items,
				{
					id: "private",
					createdAt: 24,
					private: true,
					venue: {
						name: "喫茶店",
						hierarchy: [{ name: "駅ビル" }],
						categories: [{ name: "カフェ", primary: true }],
						location: {
							neighborhood: "有楽町",
							city: "千代田区",
							state: "東京都",
						},
					},
					photos: {
						items: [
							{
								prefix: "https://fastly.4sqi.net/img/general/",
								suffix: "/fixture.jpg",
							},
						],
					},
					shout: "private note",
				},
				{ id: "visibility", createdAt: 23, visibility: "private" },
			]);
		},
	);
	assert.deepEqual(await fetchCheckins(accessToken), {
		checkins: [
			{
				id: "private",
				createdAt: 24,
				venueName: "喫茶店",
				parentVenueName: "駅ビル",
				category: "カフェ",
				region: "有楽町",
				comment: "private note",
				photoUrl: "https://fastly.4sqi.net/img/general/width960/fixture.jpg",
				isPrivate: true,
			},
			{
				id: "visibility",
				createdAt: 23,
				venueName: null,
				parentVenueName: null,
				category: null,
				region: null,
				comment: null,
				photoUrl: null,
				isPrivate: true,
			},
			...items
				.slice()
				.reverse()
				.slice(0, 18)
				.map((item) => ({
					...item,
					venueName: null,
					parentVenueName: null,
					category: null,
					region: null,
					comment: null,
					photoUrl: null,
					isPrivate: false,
				})),
		],
	});
	upstream.mock.mockImplementation(async (request: string) => {
		assert.equal(request, "/api/swarm/checkins?v=20240109&limit=20&offset=20");
		return historyResult([]);
	});
	assert.deepEqual(await fetchCheckins(accessToken, 20), { checkins: [] });
});

test("the proxied share link belongs to the selected check-in", async (t) => {
	let detail = {
		id,
		user: { relationship: "self" },
		checkinShortUrl: url,
		shout: "コメント",
		photos: {
			items: [
				{
					prefix: "https://fastly.4sqi.net/img/general/",
					suffix: "/fixture.jpg",
				},
			],
		},
		venue: {
			name: "スポット",
			location: { city: "千代田区", state: "東京都" },
		},
	};
	const upstream = t.mock.method(
		globalThis,
		"fetch",
		async (request: string, init: RequestInit) => {
			assert.equal(request, `/api/swarm/checkins/${id}?v=20240109`);
			assert.equal(
				new Headers(init.headers).get("authorization"),
				"Bearer test-token",
			);
			return detailResult(detail);
		},
	);
	assert.deepEqual(await fetchCheckinShareLink(accessToken, id), {
		url,
		venueName: "スポット",
		comment: "コメント",
		photoUrl: "https://fastly.4sqi.net/img/general/width960/fixture.jpg",
		city: "千代田区",
		state: "東京都",
	});
	detail = { ...detail, id: "another" };
	await assert.rejects(fetchCheckinShareLink(accessToken, id), { status: 404 });
	detail = { ...detail, id, user: { relationship: "friend" } };
	await assert.rejects(fetchCheckinShareLink(accessToken, id), { status: 404 });

	for (const invalid of ["", "../a", "a/b"]) {
		await assert.rejects(fetchCheckinShareLink(accessToken, invalid), {
			status: 400,
		});
	}
	assert.equal(upstream.mock.callCount(), 3);
});

test("check-in URLs work without URL.parse", async (t) => {
	const descriptor = Object.getOwnPropertyDescriptor(URL, "parse");
	Reflect.deleteProperty(URL, "parse");
	t.after(() => {
		if (descriptor) {
			Object.defineProperty(URL, "parse", descriptor);
		}
	});
	const checkin = {
		id,
		createdAt: 1,
		user: { relationship: "self" },
		checkinShortUrl: url,
		photos: {
			items: [{ prefix: "https://example.test/", suffix: "/photo.jpg" }],
		},
	};
	t.mock.method(globalThis, "fetch", async (request: string) =>
		request.startsWith(`/api/swarm/checkins/${id}?`)
			? detailResult(checkin)
			: historyResult([checkin]),
	);
	const { checkins } = await fetchCheckins(accessToken);
	assert.equal(checkins[0].photoUrl, "https://example.test/width960/photo.jpg");
	assert.equal((await fetchCheckinShareLink(accessToken, id)).url, url);
});

test("share link can be absent", async (t) => {
	const checkin = { id, user: { relationship: "self" } };
	const upstream = t.mock.method(globalThis, "fetch", async () =>
		detailResult(checkin),
	);
	assert.deepEqual(await fetchCheckinShareLink(accessToken, id), {
		url: null,
		venueName: null,
		comment: null,
		photoUrl: null,
		city: null,
		state: null,
	});
	upstream.mock.mockImplementation(async () =>
		detailResult({ ...checkin, checkinShortUrl: "http://example.test/" }),
	);
	assert.deepEqual(await fetchCheckinShareLink(accessToken, id), {
		url: null,
		venueName: null,
		comment: null,
		photoUrl: null,
		city: null,
		state: null,
	});
});

test("upstream errors preserve retry behavior", async (t) => {
	const upstream = t.mock.method(globalThis, "fetch");
	const cases = [
		{
			body: '{"meta":{"code":401,"errorDetail":"sensitive"}}',
			status: 401,
			expected: 401,
		},
		{
			body: "",
			status: 403,
			headers: { "X-RateLimit-Remaining": "0" },
			expected: 429,
		},
		{ body: "bad JSON", status: 200, expected: 502 },
		{ body: "sensitive", status: 500, expected: 502 },
	];
	for (const { body, status, headers, expected } of cases) {
		upstream.mock.mockImplementation(
			async () => new Response(body, { status, headers }),
		);
		await assert.rejects(
			fetchCheckins(accessToken),
			(error: unknown) =>
				error instanceof SwarmRequestError &&
				error.status === expected &&
				!error.message.includes("sensitive"),
		);
	}
});
