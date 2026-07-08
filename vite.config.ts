import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 3000,
		host: true,
		hmr: {
			protocol: 'ws',
			host: 'localhost'
		}
	},
	worker: {
		format: 'es'
	}
});