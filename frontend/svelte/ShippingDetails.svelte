<script>
  import { cart } from "./stores/cart.js";
  import { email } from "./stores/guest.js";
  import {
    phone,
    name,
    zip,
    city,
    state,
    address
  } from "./stores/shippingDetails.js";
  import CartItem from "./CartItem.svelte";

  import { cartStatus } from "./cartState.js";
  import { fade, fly } from "svelte/transition";
  import { send, receive } from "./crossfade.js";

  export let cartText;
  export let paymentDetails = { cardNumber: "", cvv: "", expiry: "", name: "" };
  function reset() {
    cart.reset();
  }
</script>

<div class="cart-container flex-auto p-4">
  <div class="flex py-4">
    <h1 class="flex-auto text-2xl font-black">{cartText}</h1>
    <a
      href="#"
      on:click={reset}
      class="cart-reset bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold
      py-2 px-4 rounded inline-flex items-center">
      Reset
    </a>
  </div>

  <div class="step-container flex">
    <div class="flex-auto">
      {#if $cartStatus == 'expandCart'}
        <div class="pr-16">
          <div class="pb-2 mb-2 border-b border-gray-400">
            <label class="address-label" for="email">Email</label>
            <input
              bind:value={$email}
              class="address-input focus:outline-none focus:border-blue-500" />
          </div>
          <label class="address-label" for="phone">Phone</label>
          <input
            bind:value={$phone}
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="name">Name</label>
          <input
            bind:value={$name}
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="zip">Zip</label>
          <input
            bind:value={$zip}
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="city">City</label>
          <input
            bind:value={$city}
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="state">State</label>
          <input
            bind:value={$state}
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="address">Address</label>
          <input
            bind:value={$address}
            class="address-input focus:outline-none focus:border-blue-500" />
        </div>
      {:else if $cartStatus == 'showPayment'}
        <div class="pr-16">
          <label class="address-label" for="card-number">Card Number</label>
          <input
            bind:value={paymentDetails.cardNumber}
            class="address-input focus:outline-none focus:border-blue-500" />
          <div class="flex">
            <div class="mr-8">
              <label class="address-label" for="cvv">CVV</label>
              <input
                bind:value={paymentDetails.cvv}
                class="address-input focus:outline-none focus:border-blue-500" />
            </div>
            <div class="mr-8">
              <label class="address-label" for="expiry">Expiry</label>
              <input
                bind:value={paymentDetails.expiry}
                class="address-input flex-auto focus:outline-none
                focus:border-blue-500" />
            </div>
            <div class="flex-auto">
              <label class="address-label" for="name-on-card">
                Name on Card
              </label>
              <input
                bind:value={paymentDetails.name}
                class="address-input flex-auto focus:outline-none
                focus:border-blue-500" />
            </div>
          </div>
        </div>
      {/if}
    </div>
    <div class="line-items w-full self-start">
      <ul>
        {#if $cart.length > 0}
          {#each $cart as { product, quantity, total } (product.id)}
            <li
              class="line-item flex py-2 w-full self-start border-b-2
              border-gray-200"
              in:receive|local
              out:send|local>

              <CartItem {product} {quantity} {total} />

            </li>
          {/each}
        {/if}
      </ul>
      <div class="flex w-full">
        <h3 class="flex-auto self-center uppercase font-bold">Total</h3>
        <span class="text-2xl text-green-600">Cart total</span>
      </div>
    </div>
  </div>
</div>
