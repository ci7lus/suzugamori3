export default function LoadingPin({ label }: { label: string }) {
	return (
		<div className="loading-pin" role="status">
			<span className="sr-only">{label}</span>
			<span className="loading-pin-spin" aria-hidden="true">
				<span className="pin" />
			</span>
		</div>
	);
}
