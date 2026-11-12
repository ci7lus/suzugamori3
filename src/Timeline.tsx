import { Share } from "lucide-react";
import { useState } from "react";
import type { Checkin } from "../shared/swarm.ts";
import LoadingPin from "./LoadingPin.tsx";
import { fetchCheckinShareLink, SwarmRequestError } from "./swarm-api.ts";

const dayFormat = new Intl.DateTimeFormat("ja-JP", {
	month: "long",
	day: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("ja-JP", {
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});
const missingVenue = "場所名なし";

function groupByDay(checkins: Checkin[]) {
	const days = new Map<string, { label: string; items: Checkin[] }>();
	for (const checkin of checkins) {
		const date = new Date(checkin.createdAt * 1000);
		const key = date.toDateString();
		const day = days.get(key);
		if (day) {
			day.items.push(checkin);
		} else {
			days.set(key, { label: dayFormat.format(date), items: [checkin] });
		}
	}
	return days;
}

async function fetchSharePhoto(url: string): Promise<File | null> {
	const response = await fetch(url, {
		credentials: "omit",
		referrerPolicy: "no-referrer",
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		return null;
	}
	const blob = await response.blob();
	const format = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.exec(
		blob.type,
	)?.[1];
	if (!blob.size || !format) {
		return null;
	}
	const extension = format === "jpeg" ? "jpg" : format;
	return new File([blob], `check-in.${extension}`, { type: blob.type });
}

function ShareAction({
	accessToken,
	checkin,
	onUnauthorized,
}: {
	accessToken: string;
	checkin: Checkin;
	onUnauthorized: () => void;
}) {
	const [pending, setPending] = useState(false);
	const [preparedShare, setPreparedShare] = useState<
		(ShareData & { text: string }) | null
	>(null);
	const [message, setMessage] = useState("");
	const venueName = checkin.venueName ?? missingVenue;

	async function shareOrCopy() {
		setPending(true);
		setMessage("");
		let payload = preparedShare;
		try {
			if (!payload) {
				const details = await fetchCheckinShareLink(accessToken, checkin.id);
				if (!details.url) {
					setMessage("共有リンクを取得できません。");
					return;
				}
				const locality = [details.city, details.state]
					.filter(Boolean)
					.join(", ");
				const placeName = details.venueName ?? missingVenue;
				const place = locality ? `${placeName} in ${locality}` : placeName;
				const text = details.comment
					? `${details.comment} (@ ${place}) ${details.url}`
					: `I'm at ${place} ${details.url}`;
				payload = { text };
				if (
					details.photoUrl &&
					typeof navigator.share === "function" &&
					typeof navigator.canShare === "function"
				) {
					const photo = await fetchSharePhoto(details.photoUrl).catch(
						() => null,
					);
					if (
						photo &&
						navigator.canShare({ files: [photo] }) &&
						navigator.canShare({ text, files: [photo] })
					) {
						payload.files = [photo];
					}
				}
			}
			if (
				typeof navigator.share === "function" &&
				(typeof navigator.canShare !== "function" ||
					navigator.canShare(payload))
			) {
				await navigator.share(payload);
			} else {
				await navigator.clipboard.writeText(payload.text);
				setMessage("共有内容をコピーしました。");
			}
			setPreparedShare(null);
		} catch (error) {
			if (error instanceof SwarmRequestError && error.status === 401) {
				onUnauthorized();
			} else if (error instanceof DOMException && error.name === "AbortError") {
				setPreparedShare(null);
			} else if (
				payload &&
				!preparedShare &&
				error instanceof DOMException &&
				error.name === "NotAllowedError"
			) {
				setPreparedShare(payload);
				setMessage("もう一度共有アイコンを押してください。");
			} else {
				setPreparedShare(null);
				setMessage(
					payload
						? "共有できませんでした。"
						: "共有リンクを取得できませんでした。",
				);
			}
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="checkin-actions">
			<button
				className="checkin-share"
				type="button"
				aria-label={`${venueName}のチェックインを共有`}
				onClick={shareOrCopy}
				disabled={pending}
			>
				<Share size={20} aria-hidden="true" />
			</button>
			{checkin.isPrivate && <span className="privacy-label">非公開</span>}
			{message && (
				<span className="status-message" role="status">
					{message}
				</span>
			)}
			{pending && <LoadingPin label="共有内容を準備しています…" />}
		</div>
	);
}

export default function Timeline({
	accessToken,
	checkins,
	onUnauthorized,
}: {
	accessToken: string;
	checkins: Checkin[];
	onUnauthorized: () => void;
}) {
	return (
		<div className="timeline">
			{Array.from(groupByDay(checkins), ([dayKey, day]) => (
				<section className="timeline-day" key={dayKey}>
					<h2 className="day-heading">{day.label}</h2>
					<ul className="checkin-list">
						{day.items.map((checkin) => {
							const date = new Date(checkin.createdAt * 1000);
							const metadata = [checkin.category, checkin.region]
								.filter(Boolean)
								.join("・");
							return (
								<li className="checkin" key={checkin.id}>
									<span className="checkin-summary">
										<span className="checkin-marker" aria-hidden="true">
											<span className="pin" />
										</span>
										<span className="checkin-text">
											<span className="checkin-name">
												{checkin.venueName ?? missingVenue}
												{checkin.venueName &&
													checkin.parentVenueName &&
													` at ${checkin.parentVenueName}`}
											</span>
											{metadata && (
												<span className="checkin-meta">{metadata}</span>
											)}

											<time
												className="checkin-time"
												dateTime={date.toISOString()}
											>
												{timeFormat.format(date)}
											</time>
										</span>
									</span>
									{checkin.comment && (
										<span className="checkin-comment">{checkin.comment}</span>
									)}
									{checkin.photoUrl && (
										<span className="checkin-photo">
											<img
												src={checkin.photoUrl}
												alt="チェックインの写真"
												loading="lazy"
												referrerPolicy="no-referrer"
											/>
										</span>
									)}
									<ShareAction
										accessToken={accessToken}
										checkin={checkin}
										onUnauthorized={onUnauthorized}
									/>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
