import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetchProfilePhoto } from "./swarm-api.ts";

function AccountAvatar({ photo }: { photo?: string | null }) {
	const [failed, setFailed] = useState(false);
	return (
		<span className="account-avatar" aria-hidden="true">
			{photo && !failed ? (
				<img
					src={photo}
					alt=""
					width={36}
					height={36}
					referrerPolicy="no-referrer"
					onError={() => setFailed(true)}
				/>
			) : (
				<span className="avatar-placeholder" />
			)}
		</span>
	);
}

export default function AccountMenu({
	accessToken,
	onLogout,
}: {
	accessToken: string | null;
	onLogout: () => void;
}) {
	const menu = useRef<HTMLDetailsElement>(null);
	const { data: photo } = useSWR(
		accessToken ? (["swarm-profile", accessToken] as const) : null,
		([, token]) => fetchProfilePhoto(token),
		{ revalidateOnFocus: false, shouldRetryOnError: false },
	);

	useEffect(() => {
		if (!accessToken) {
			return;
		}
		function dismissOutside(event: PointerEvent) {
			const details = menu.current;
			if (
				details?.open &&
				event.target instanceof Node &&
				!details.contains(event.target)
			) {
				details.open = false;
			}
		}
		document.addEventListener("pointerdown", dismissOutside);
		return () => document.removeEventListener("pointerdown", dismissOutside);
	}, [accessToken]);

	if (!accessToken) {
		return <AccountAvatar />;
	}

	return (
		<details
			className="account-menu"
			ref={menu}
			onKeyDown={(event) => {
				if (event.key === "Escape" && event.currentTarget.open) {
					event.currentTarget.open = false;
					event.currentTarget.querySelector("summary")?.focus();
				}
			}}
		>
			<summary aria-label="アカウントメニュー">
				<AccountAvatar key={photo ?? ""} photo={photo} />
			</summary>
			<div className="account-menu-panel">
				<button className="logout-button" type="button" onClick={onLogout}>
					ログアウト
				</button>
			</div>
		</details>
	);
}
