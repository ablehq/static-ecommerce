<script>
  import { onMount } from "svelte";
  import { cart } from "./stores.js";

  import { crossfade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";

  export let product;
  export let quantity;
  export let total;
  function removeFromCart() {
    cart.removeProduct(product);
  }
  function increment() {
    cart.increaseQuantity(product);
  }
  function decrement() {
    cart.decreaseQuantity(product);
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

  onMount(async () => {});
</script>

<div class="flex flex-auto" data-line-item-id={product.id}>
  <div class="w-16 h-12 mr-2 overflow-hidden rounded-4">
    <img src={product.image} alt="" class="w-full" />
  </div>
  <div class="w-full">
    <div class="flex">
      <p class="flex-auto text-lg leading-none">{product.name}</p>
      <div class="line-item-quantity">
        <p class="text-sm opacity-50">
          <a href="#" on:click={decrement}>-</a>
          {quantity}
          <a href="#" on:click={increment}>+</a>
        </p>
      </div>
      <div class="ml-4 line-item-remove">
        <a href="#" on:click={removeFromCart}>Remove</a>
      </div>
    </div>
    <div class="flex block">
      <div class="flex-auto text-sm italic">
        Rs. {product.price} *
        <span>{quantity}</span>
      </div>
      <p class="font-bold">Rs. {total}</p>
    </div>
  </div>
</div>
