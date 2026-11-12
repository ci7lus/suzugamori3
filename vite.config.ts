import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
	plugins: [
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		VitePWA({
			devOptions: {
				enabled: mode === "development",
			},
			includeAssets: ["internet_buzz_tsubuyaki3.png"],
			manifest: {
				background_color: "#FF8B46",
				description: "-That's Journey-",
				display: "standalone",
				icons: [
					{
						sizes: "512x512",
						src: "/internet_buzz_tsubuyaki3.png",
						type: "image/png",
					},
					{
						purpose: "maskable",
						sizes: "512x512",
						src: "/internet_buzz_tsubuyaki3.png",
						type: "image/png",
					},
				],
				name: "suzugamori3",
				short_name: "szgmr3",
				start_url: "/",
				theme_color: "#FF8B46",
			},
			registerType: "autoUpdate",
			workbox: {
				cleanupOutdatedCaches: true,
				globPatterns: mode === "development" ? [] : ["**/*.{js,png,svg,ico}"],
				navigateFallbackDenylist: [
					/^\/\.netlify\/functions\//,
					/^\/api\/swarm\//,
				],
			},
		}),
	],
}));
