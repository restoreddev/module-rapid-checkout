<script>
	import { onMount } from 'svelte';

	let username = '';
	let firstname = '';
	let lastname = '';
	let company = '';
	let street0 = '';
	let street1 = '';
	let city = '';
	let region_id = 0;
	let postcode = '';
	let telephone = '';

	let shippingMethods = [];

	function loadShippingMethods() {
		let quoteId = '16BANZzh5Oqq4e6l2JMO1CvPM8qTLeQ7';
		fetch(`/rest/default/V1/guest-carts/${quoteId}/estimate-shipping-methods`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				address: {
					firstname, lastname, city, region_id, postcode, company,
					street: [street0, street1],
					country_id: 'US',
				}
			}),
		}).then(response => response.json()).then(data => {
			shippingMethods = data;
		});
	}

	function onAddressChange() {
		if (
			firstname == '' ||
			lastname == '' ||
			street0 == '' ||
			city == '' ||
			region_id == 0 ||
			postcode == ''
		) {
			return;
		}

		loadShippingMethods();
	}

	onMount(() => {
		loadShippingMethods();
	});
</script>

<style>
	h2 {
		border-bottom: 1px dotted #AAA;
		padding-bottom: 1rem;
		max-width: 40%;
	}
	.form {
		max-width: 40%;
	}
</style>

<h2>Shipping Address</h2>
<form class="form form-shipping-address">
	<div class="fieldset address">
		<div class="field">
			<label class="label">Email Address</label>
			<div class="control">
				<input class="input-text" type="email" name="username" bind:value={username} />
			</div>
		</div>
		<div class="field">
			<label class="label">First Name</label>
			<div class="control">
				<input
					class="input-text"
					type="text"
					name="firstname"
					bind:value={firstname}
					on:change={onAddressChange}
				/>
			</div>
		</div>
		<div class="field">
			<label class="label">Last Name</label>
			<div class="control">
				<input
					class="input-text"
					type="text"
					name="lastname"
					bind:value={lastname}
					on:change={onAddressChange}
				/>
			</div>
		</div>
		<div class="field">
			<label class="label">Company</label>
			<div class="control">
				<input
					class="input-text"
					type="text"
					name="company"
					bind:value={company}
					on:change={onAddressChange}
				/>
			</div>
		</div>
		<fieldset class="field street">
			<legend class="label">Street Address</legend>
			<div class="control">
				<div class="field">
					<div class="control">
						<input
							class="input-text"
							type="text"
							name="street[0]"
							bind:value={street0}
							on:change={onAddressChange}
						/>
					</div>
				</div>
				<div class="field additional">
					<div class="control">
						<input
							class="input-text"
							type="text"
							name="street[1]"
							bind:value={street1}
							on:change={onAddressChange}
						/>
					</div>
				</div>
			</div>
		</fieldset>
		<div class="field">
			<label class="label">City</label>
			<div class="control">
				<input
					class="input-text"
					type="text"
					name="city"
					bind:value={city}
					on:change={onAddressChange}
				/>
			</div>
		</div>
		<div class="field">
			<label class="label">State/Province</label>
			<div class="control">
				<select
					class="select"
					name="region_id"
					bind:value={region_id}
					on:change={onAddressChange}
				>
					<option value="0">Please select a region, state or province.</option>
					<option value="1">Alabama</option>
					<option value="2">Alaska</option>
					<option value="3">American Samoa</option>
					<option value="4">Arizona</option>
				</select>
			</div>
		</div>
		<div class="field">
			<label class="label">Zip/Postal Code</label>
			<div class="control">
				<input
					class="input-text"
					type="text"
					name="postcode"
					bind:value={postcode}
					on:change={onAddressChange}
				/>
			</div>
		</div>
		<div class="field">
			<label class="label">Telephone</label>
			<div class="control">
				<input class="input-text" type="text" name="telephone" bind:value={telephone} />
			</div>
		</div>
	</div>
</form>

<h2>Shipping Methods</h2>
<form class="form">
	<table class="table-checkout-shipping-method">
		<tbody>
			{#each shippingMethods as method}
				<tr class="row">
					<td class="col col-method">
						<input
							class="radio"
							type="radio"
							name="shipping_method"
							value="{method.carrier_code}_{method.method_code}"
						/>
					</td>
					<td class="col col-price">
						<span class="price">${method.amount}</span>
					</td>
					<td class="col col-method">{method.method_title}</td>
					<td class="col col-carrier">{method.carrier_title}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</form>
