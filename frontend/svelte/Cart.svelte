<script>
  import { displayCart as cart, isCartRestored } from "./stores/cart.js";
  import { cartStatus } from "./cartState.js";
  import CartItem from "./CartItem.svelte";
  import ShippingDetails from "./ShippingDetails.svelte";
  import { crossfade, fade, fly } from "svelte/transition";
  import { send, receive } from "./crossfade.js";

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
</script>

<style>

</style>

<div class="flex w-full mt-4 px-4 ">
  <div class="flex-auto" />
  <a href="#" on:click={hideCart} class="hide-cart">Close</a>
</div>

{#if $cartStatus !== 'showConfirmation'}
  <ShippingDetails {cartText} />
{/if}

{#if $cartStatus === 'showConfirmation'}
  <div class="confirmation-container pt-24 flex-auto p-4">
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
