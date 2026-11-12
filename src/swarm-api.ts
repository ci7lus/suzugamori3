import type {
	Checkin,
	CheckinHistory,
	CheckinShareLink,
} from "../shared/swarm.ts";

export const loginPath = "/.netlify/functions/swarm-login";
const checkinsPath = "/api/swarm/checkins";
const apiVersion = "20240109";
export const historyLimit = 20;

export class SwarmRequestError extends Error {
	readonly status: 400 | 401 | 404 | 429 | 502;

	constructor(status: SwarmRequestError["status"]) {
		super(`Foursquare API request failed (${status})`);
		this.status = status;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failureStatus(status: number, rateLimitRemaining: string | null) {
	if (status === 401 || status === 404) {
		return status;
	}
	if (status === 429 || (status === 403 && rateLimitRemaining === "0")) {
		return 429;
	}
	return 502;
}

async function fetchApi(
	path: string,
	accessToken: string,
	query?: Record<string, string>,
): Promise<Record<string, unknown>> {
	const params = new URLSearchParams({ v: apiVersion, ...query });
	const response = await fetch(`${path}?${params}`, {
		cache: "no-store",
		credentials: "omit",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
		},
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	});
	const remaining = response.headers.get("x-ratelimit-remaining");
	if (!response.ok) {
		throw new SwarmRequestError(failureStatus(response.status, remaining));
	}

	const payload: unknown = await response.json().catch(() => {
		throw new SwarmRequestError(502);
	});
	if (
		!isRecord(payload) ||
		!isRecord(payload.meta) ||
		typeof payload.meta.code !== "number"
	) {
		throw new SwarmRequestError(502);
	}
	if (payload.meta.code !== 200) {
		throw new SwarmRequestError(failureStatus(payload.meta.code, remaining));
	}
	if (!isRecord(payload.response)) {
		throw new SwarmRequestError(502);
	}
	return payload.response;
}

function parseCheckin(item: unknown): Checkin {
	if (
		!isRecord(item) ||
		typeof item.id !== "string" ||
		!item.id ||
		typeof item.createdAt !== "number" ||
		!Number.isSafeInteger(item.createdAt) ||
		item.createdAt < 0 ||
		item.createdAt > 8.64e12
	) {
		throw new SwarmRequestError(502);
	}
	const venue = isRecord(item.venue) ? item.venue : null;
	const parent = venue && isRecord(venue.parent) ? venue.parent : null;
	const hierarchy = Array.isArray(venue?.hierarchy) ? venue.hierarchy : [];
	const nearestParent = hierarchy.find(isRecord);
	const categories = Array.isArray(venue?.categories)
		? venue.categories.filter(isRecord)
		: [];
	const category =
		categories.find((entry) => entry.primary === true) ?? categories[0];
	const location = isRecord(venue?.location) ? venue.location : null;

	return {
		id: item.id,
		createdAt: item.createdAt,
		venueName: readLabel(venue?.name),
		parentVenueName: readLabel(parent?.name) ?? readLabel(nearestParent?.name),
		category: readLabel(category?.name),
		region:
			readLabel(location?.neighborhood) ??
			readLabel(location?.city) ??
			readLabel(location?.state),
		comment: readLabel(item.shout),
		photoUrl: firstCheckinPhoto(item.photos),
		isPrivate: item.private === true || item.visibility === "private",
	};
}

function readLabel(value: unknown): string | null {
	return typeof value === "string" ? value.trim() || null : null;
}

function readHttpsUrl(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password
			? url.href
			: null;
	} catch {
		return null;
	}
}

function readPhotoUrl(photo: unknown, size: string): string | null {
	if (!isRecord(photo)) {
		return null;
	}
	const { prefix, suffix } = photo;
	if (
		typeof prefix !== "string" ||
		!prefix ||
		typeof suffix !== "string" ||
		!suffix
	) {
		return null;
	}
	return readHttpsUrl(`${prefix}${size}${suffix}`);
}

function firstCheckinPhoto(photos: unknown): string | null {
	if (!isRecord(photos) || !Array.isArray(photos.items)) {
		return null;
	}
	return (
		photos.items
			.map((photo) => readPhotoUrl(photo, "width960"))
			.find(Boolean) ?? null
	);
}

export async function fetchProfilePhoto(
	accessToken: string,
): Promise<string | null> {
	const { user } = await fetchApi("/api/swarm/profile", accessToken);
	return isRecord(user) ? readPhotoUrl(user.photo, "100x100") : null;
}

export async function fetchCheckins(
	accessToken: string,
	offset = 0,
): Promise<CheckinHistory> {
	const { checkins } = await fetchApi(checkinsPath, accessToken, {
		limit: String(historyLimit),
		offset: String(offset),
	});
	if (!isRecord(checkins) || !Array.isArray(checkins.items)) {
		throw new SwarmRequestError(502);
	}

	return {
		checkins: checkins.items
			.map(parseCheckin)
			.sort((first, second) => second.createdAt - first.createdAt)
			.slice(0, historyLimit),
	};
}

export async function fetchCheckinShareLink(
	accessToken: string,
	id: string,
): Promise<CheckinShareLink> {
	if (!/^[a-z0-9_-]{1,128}$/i.test(id)) {
		throw new SwarmRequestError(400);
	}
	const { checkin } = await fetchApi(
		`${checkinsPath}/${encodeURIComponent(id)}`,
		accessToken,
	);
	if (!isRecord(checkin)) {
		throw new SwarmRequestError(502);
	}
	if (
		checkin.id !== id ||
		!isRecord(checkin.user) ||
		checkin.user.relationship !== "self"
	) {
		throw new SwarmRequestError(404);
	}

	const venue = isRecord(checkin.venue) ? checkin.venue : null;
	const location = isRecord(venue?.location) ? venue.location : null;
	return {
		venueName: readLabel(venue?.name),
		comment: readLabel(checkin.shout),
		city: readLabel(location?.city),
		state: readLabel(location?.state),
		photoUrl: firstCheckinPhoto(checkin.photos),
		url: readHttpsUrl(checkin.checkinShortUrl),
	};
}
