<script>
  import { onMount } from "svelte";
  import { cart, isCartRestored } from "./stores.js";
  import { cartStatus } from "./cartState.js";
  import CartItem from "./CartItem.svelte";
  import { crossfade, fade, fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";

  const cartContainer = document.getElementById("cart");
  const mainContainer = document.querySelector("#main-container");

  let cartText = "Cart";

  function reset() {
    cart.reset();
  }

  function hideCart() {
    cartContainer.classList.remove(
      "show-cart",
      "expand-cart",
      "show-shipping",
      "show-payment",
      "show-confirmation"
    );
    mainContainer.classList.remove("-translate-x-64");
    cartText = "Cart";
    cartStatus.set("");
  }

  function expandCart() {
    cartContainer.classList.remove("show-cart");
    cartContainer.classList.add("expand-cart", "show-shipping");
    mainContainer.classList.add(
      "transition-all",
      "duration-500",
      "transform",
      "-translate-x-64"
    );
    cartText = "Checking out as Guest";
    cartStatus.set("expandCart");
  }

  function showPayment() {
    cartText = "Payment";
    cartContainer.classList.remove("show-shipping");
    cartContainer.classList.add("show-payment");
    cartStatus.set("showPayment");
  }

  function showConfirmation() {
    cartContainer.classList.remove("show-paymnent");
    cartStatus.set("showConfirmation");
  }

  const [send, receive] = crossfade({
    duration: d => Math.sqrt(d * 200),

    fallback(node, params) {
      const style = getComputedStyle(node);
      const transform = style.transform === "none" ? "" : style.transform;

      return {
        duration: 600,
        easing: quintOut,
        css: t => `
					transform: ${transform} scale(${t});
					opacity: ${t}
				`
      };
    }
  });
</script>

<style>

</style>

<div class="flex w-full mt-4 px-4 ">
  <div class="flex-auto" />
  <a href="#" on:click={hideCart} class="hide-cart">Close</a>
</div>
<div class="flex py-4">
  <h1 class="flex-auto text-2xl font-black">{cartText}</h1>
  <a href="#" on:click={reset} class="cart-reset mt-2">Reset</a>
</div>

{#if $cartStatus != 'showConfirmation'}
  <div
    class="cart-container flex-auto p-4"
    in:fly={{ y: 80, duration: 1100 }}
    out:fade>

    <div class="step-container flex">
      {#if $cartStatus == 'expandCart'}
        <div
          class="flex-auto pr-16"
          in:fly={{ y: 80, duration: 500, delay: 300 }}
          out:fade={{ duration: 200 }}>
          <div class="pb-2 mb-2 border-b border-gray-400">
            <label class="address-label" for="email">Email</label>
            <input
              type="text"
              id="email"
              class="address-input focus:outline-none focus:border-blue-500" />
          </div>
          <label class="address-label" for="phone">Phone</label>
          <input
            type="text"
            id="phone"
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="name">Name</label>
          <input
            type="text"
            id="name"
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="zip">Zip</label>
          <input
            type="text"
            id="zip"
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="city">City</label>
          <input
            type="text"
            id="city"
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="state">State</label>
          <input
            type="text"
            id="state"
            class="address-input focus:outline-none focus:border-blue-500" />
          <label class="address-label" for="address">Address</label>
          <input
            type="text"
            id="address"
            class="address-input focus:outline-none focus:border-blue-500" />
        </div>
      {:else if $cartStatus == 'showPayment'}
        <div
          class="flex-auto pr-16"
          in:fly={{ y: 80, duration: 500, delay: 600 }}
          out:fade={{ duration: 200 }}>
          <label class="address-label" for="card-number">Card Number</label>
          <input
            type="text"
            id="card-number"
            class="address-input focus:outline-none focus:border-blue-500" />
          <div class="flex">
            <div class="mr-8">
              <label class="address-label" for="cvv">CVV</label>
              <input
                type="text"
                id="cvv"
                class="address-input focus:outline-none focus:border-blue-500" />
            </div>
            <div class="mr-8">
              <label class="address-label" for="expiry">Expiry</label>
              <input
                type="date"
                id="expiry"
                class="address-input flex-auto focus:outline-none
                focus:border-blue-500" />
            </div>
            <div class="flex-auto">
              <label class="address-label" for="name-on-card">
                Name on Card
              </label>
              <input
                type="text"
                id="name-on-card"
                class="address-input flex-auto focus:outline-none
                focus:border-blue-500" />
            </div>
          </div>
        </div>
      {/if}
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
{/if}
{#if $cartStatus == 'showConfirmation'}
  <div
    class="confirmation-container pt-24 flex-auto p-4"
    in:fly={{ y: 80, duration: 1100 }}
    out:fade>
    <div class="mb-12 text-center">
      <h3 class="text-2xl font-bold">Your order has been confirmed</h3>
      <p class="font-bold">R37542347</p>
    </div>
    <div class="mx-auto">
      <div class="line-items mx-auto w-full self-start">
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
{/if}
{#if $cartStatus == ''}
  <a
    href="#"
    class="w-full bg-black text-white uppercase text-center p-4 self-end"
    on:click={expandCart}>
    Checkout
  </a>
{:else if $cartStatus == 'expandCart'}
  <a
    href="#"
    class="w-full bg-black text-white uppercase text-center p-4 self-end"
    on:click={showPayment}>
    Checkout
  </a>
{:else if $cartStatus == 'showPayment'}
  <a
    href="#"
    class="w-full bg-black text-white uppercase text-center p-4 self-end"
    on:click={showConfirmation}>
    Checkout
  </a>
{/if}
