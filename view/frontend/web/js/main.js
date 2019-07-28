import App from './App.svelte';

const el = document.querySelector('#rapidcheckout-app');
const quoteId = el.dataset.quoteId;

const app = new App({
	target: el,
	props: {
		quoteId
	}
});

export default app;
