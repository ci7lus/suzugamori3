export const accessTokenStorageKey = "suzugamori3.swarm.accessToken";

export type Checkin = {
	id: string;
	createdAt: number;
	venueName: string | null;
	parentVenueName: string | null;
	category: string | null;
	region: string | null;
	comment: string | null;
	photoUrl: string | null;
	isPrivate: boolean;
};

export type CheckinHistory = { checkins: Checkin[] };
export type CheckinShareLink = {
	venueName: string | null;
	comment: string | null;
	city: string | null;
	state: string | null;
	photoUrl: string | null;
	url: string | null;
};
