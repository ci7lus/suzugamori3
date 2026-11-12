import { useCallback, useEffect, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { accessTokenStorageKey } from "../shared/swarm.ts";
import AccountMenu from "./AccountMenu.tsx";
import LoadingPin from "./LoadingPin.tsx";
import { fetchCheckins, historyLimit, SwarmRequestError } from "./swarm-api.ts";
import { prepareSwarmLogin } from "./swarm-authorization.ts";
import Timeline from "./Timeline.tsx";

function readStoredAccessToken(): string | null {
	try {
		return window.localStorage.getItem(accessTokenStorageKey);
	} catch {
		return null;
	}
}

function readLoginNotice(): string | null {
	const result = new URLSearchParams(window.location.search).get("login");
	switch (result) {
		case "cancelled":
			return "ログインがキャンセルされました。";
		case "failed":
			return "ログインできませんでした。もう一度お試しください。";
		default:
			return null;
	}
}

function App() {
	const [loginNotice, setLoginNotice] = useState(readLoginNotice);
	const [accessToken, setAccessToken] = useState(readStoredAccessToken);
	const [logoutFailed, setLogoutFailed] = useState(false);
	const pageEnd = useRef<HTMLDivElement>(null);
	const { data, error, isLoading, isValidating, mutate, size, setSize } =
		useSWRInfinite(
			(index, previousPage) =>
				accessToken &&
				(!previousPage || previousPage.checkins.length === historyLimit)
					? (["swarm-checkins", accessToken, index * historyLimit] as const)
					: null,
			([, token, offset]) => fetchCheckins(token, offset),
			{ shouldRetryOnError: false, revalidateFirstPage: false },
		);
	const checkins = Array.from(
		new Map(
			data?.flatMap((page) =>
				page.checkins.map((item) => [item.id, item] as const),
			),
		).values(),
	).sort((first, second) => second.createdAt - first.createdAt);
	const hasMore = data?.at(-1)?.checkins.length === historyLimit;

	useEffect(() => {
		const target = pageEnd.current;
		if (!target || !hasMore || isValidating || error || data?.length !== size) {
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					observer.disconnect();
					void setSize(size + 1);
				}
			},
			{ rootMargin: "0px 0px 200px" },
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [data, error, hasMore, isValidating, setSize, size]);

	const unauthorized =
		error instanceof SwarmRequestError && error.status === 401;
	const endSession = useCallback(() => {
		try {
			const stored = window.localStorage.getItem(accessTokenStorageKey);
			if (stored === accessToken) {
				window.localStorage.removeItem(accessTokenStorageKey);
				setAccessToken(null);
			} else {
				setAccessToken(stored);
			}
			setLogoutFailed(false);
		} catch {
			setLogoutFailed(true);
		}
	}, [accessToken]);

	useEffect(() => {
		if (loginNotice) {
			const url = new URL(window.location.href);
			url.searchParams.delete("login");
			window.history.replaceState(window.history.state, "", url);
		}
	}, [loginNotice]);

	useEffect(() => {
		function syncAccessToken(event: StorageEvent) {
			if (event.key === accessTokenStorageKey || event.key === null) {
				setAccessToken(readStoredAccessToken());
			}
		}
		window.addEventListener("storage", syncAccessToken);
		return () => window.removeEventListener("storage", syncAccessToken);
	}, []);

	useEffect(() => {
		if (unauthorized) {
			endSession();
		}
	}, [unauthorized, endSession]);

	function startLogin() {
		try {
			const authorize = prepareSwarmLogin(
				import.meta.env.VITE_FOURSQUARE_CLIENT_ID,
				window.location.origin,
				document,
			);
			window.location.assign(authorize.href);
		} catch {
			setLoginNotice(
				"ログインを開始できませんでした。設定とCookieを確認してください。",
			);
		}
	}

	return (
		<div className="app-shell">
			<header className="masthead">
				<div className="masthead-inner">
					<AccountMenu
						key={accessToken}
						accessToken={unauthorized ? null : accessToken}
						onLogout={endSession}
					/>
				</div>
			</header>

			<main className="main-content">
				{!accessToken || unauthorized ? (
					<section className="panel login-panel" aria-label="Swarmでログイン">
						{loginNotice && (
							<p className="status-message" role="status">
								{loginNotice}
							</p>
						)}
						<button
							className="action-button"
							type="button"
							onClick={startLogin}
						>
							Swarmでログイン
						</button>
					</section>
				) : isLoading ? (
					<LoadingPin label="チェックインを読み込んでいます…" />
				) : (
					<section
						className="panel timeline-panel"
						aria-label="チェックイン履歴"
					>
						{logoutFailed && (
							<p className="status-message inset" role="alert">
								ログアウトできませんでした。もう一度お試しください。
							</p>
						)}
						{error && (
							<div className="status-message inset" role="alert">
								<p>チェックインを取得できませんでした。</p>
								<button
									className="text-button"
									type="button"
									onClick={() => void mutate()}
								>
									再試行
								</button>
							</div>
						)}
						{data && checkins.length === 0 && !error && (
							<p className="status-message inset" role="status">
								チェックインがありません。
							</p>
						)}
						{checkins.length > 0 && (
							<Timeline
								key={accessToken}
								accessToken={accessToken}
								checkins={checkins}
								onUnauthorized={endSession}
							/>
						)}
						{hasMore && <div ref={pageEnd} aria-hidden="true" />}
						{hasMore && !error && data && data.length < size && (
							<LoadingPin label="次のチェックインを読み込んでいます…" />
						)}
					</section>
				)}
			</main>
			<footer className="app-footer">
				<a href="https://github.com/ci7lus/suzugamori3">suzugamori3</a>
				{" made with ❤️"}
			</footer>
		</div>
	);
}

export default App;
