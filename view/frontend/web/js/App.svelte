<script>
	export let quoteId;

	import ShippingAddress from './ShippingAddress.svelte';
	import Payment from './Payment.svelte';
</script>

<ShippingAddress quoteId={quoteId} />
<Payment quoteId={quoteId} />
