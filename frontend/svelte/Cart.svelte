<script>
  import { onMount } from "svelte";
  import { cart, cartTotal, isCartRestored } from "./stores.js";
  import CartItem from "./CartItem.svelte";
  import { crossfade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";

  function reset() {
    cart.reset();
  }
  function hideCart() {
    let cart = document.getElementById("cart");
    cart.classList.remove("show-cart");
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

<div class="flex">
  <h1 class="flex-auto text-2xl font-black p-4">Cart</h1>
  <a href="#" on:click={reset} class="mt-2 p-4">Reset</a>
</div>
{#if $cart.length > 0}
  {#each $cart as { product, quantity, total } (product.id)}
    <li
      class="bg-white flex my-2 w-full self-start px-4"
      in:receive|local
      out:send|local>

      <CartItem {product} {quantity} {total} />

    </li>
  {/each}
{/if}
<div class="flex-auto" />
<div class="flex w-full px-4">
  <h3 class="flex-auto self-center uppercase font-bold">Total</h3>
  <span class="text-2xl text-green-600">${$cartTotal}</span>
</div>
<a
  href="#"
  class="w-full bg-black text-white uppercase text-center p-4 self-end">
  Checkout
</a>
