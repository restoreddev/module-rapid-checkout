<script>
	import { onMount } from 'svelte';

	export let quoteId;

	let promise = { payment_methods: [], totals: { total_segments: [] } };
	let selectedPaymentMethod = '';

	async function loadPaymentInfo() {
		let res = await fetch(`/rest/default/V1/guest-carts/${quoteId}/payment-information`);
		let data = await res.json();

		if (res.ok) {
			return data;
		} else {
			throw new Error('Could not load payment information');
		}
	}

	onMount(() => {
		promise = loadPaymentInfo();
	});
</script>

<style>
	h2 {
		border-bottom: 1px dotted #AAA;
		padding-bottom: 1rem;
		max-width: 40%;
	}
</style>

<h2>Payment Methods</h2>
{#await promise}
<p>loading...</p>
{:then data}
	<form class="form">
		<table class="table-checkout-shipping-method">
			<tbody>
				{#each data.payment_methods as method}
					<tr class="row" on:click={e => selectedPaymentMethod = method.code}>
						<td class="col col-method">
							<input
								class="radio"
								type="radio"
								name="shipping_method"
								value={method.code}
								bind:group={selectedPaymentMethod}
							/>
						</td>
						<td class="col col-method">{method.title}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</form>

	<h2>Summary</h2>
	<table class="data table table-totals" style="max-width: 40%;">
		<tbody>
			{#each data.totals.total_segments as segment}
				<tr class="totals">
					<th class="mark">{segment.title}</th>
					<td class="amount">{segment.value}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:catch error}
<p>error loading shipping methods</p>
{/await}
