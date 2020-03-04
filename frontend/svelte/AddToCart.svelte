<script>
  import { onMount } from "svelte";
  import { cart, isCartRestored } from "./stores.js";
  export let product;

  function addToCart() {
    cart.addProduct(product);
  }

  function showCart() {
    let cart = document.getElementById("cart");
    cart.classList.add("show-cart");
  }

  onMount(async () => {});
</script>

<a
  href="#"
  data-id="product checked"
  on:click={addToCart}
  on:click={showCart}
  class="add-to-cart">
  {#if $isCartRestored == true}
    <svg
      width="15"
      height="13"
      viewBox="0 0 17 15"
      xmlns="http://www.w3.org/2000/svg">
      <path
        d="M.5696813.18292095c-.31297 0-.56666667.24569817-.56666667.54878049 0
        .30308232.25369667.54878049.56666667.54878049h1.80625003L4.323848
        10.1810155c.07706667.3350487.30380889.6139024.59027778.6116707h9.44444442c.29937.0040244.5747313-.2588232.5747313-.5487805
        0-.28995731-.2753613-.55287804-.5747313-.54878048H5.37454244l-.24202333-1.09757927h9.98160569c.2537156-.00182927.4934345-.18896341.5489489-.42872561l1.3222222-5.48780488c.0736856-.31848841-.2119333-.66648658-.5489488-.66882622H3.69815356L3.39120911.61737217C3.33758356.37369534
        3.09361467.18266485 2.836348.18292095H.5696813zM6.80301467
        11.1585399c-1.03649 0-1.88888889.8254756-1.88888889 1.8292682 0
        1.0037744.85239889 1.8292683 1.88888889 1.8292683 1.03649 0
        1.88888889-.8254939 1.88888889-1.8292683
        0-1.0037743-.85239889-1.8292682-1.88888889-1.8292682zm5.66666663
        0c-1.03649 0-1.8888889.8254756-1.8888889 1.8292682 0 1.0037744.8523989
        1.8292683 1.8888889 1.8292683 1.03649 0 1.8888889-.8254939
        1.8888889-1.8292683 0-1.0037743-.8523989-1.8292682-1.8888889-1.8292682z"
        fill="#FFF"
        fill-rule="evenodd" />
    </svg>
  {:else}
    <svg
      version="1.1"
      id="L9"
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      x="0px"
      y="0px"
      width="32"
      height="32"
      viewBox="0 0 100 100"
      enable-background="new 0 0 0 0"
      xml:space="preserve">
      <rect x="0" y="0" width="7" height="30" fill="#fff">
        <animateTransform
          attributeType="xml"
          attributeName="transform"
          type="translate"
          values="0 0; 0 20; 0 0"
          begin="0"
          dur="0.6s"
          repeatCount="indefinite" />
      </rect>
      <rect x="24" y="0" width="7" height="30" fill="#fff">
        <animateTransform
          attributeType="xml"
          attributeName="transform"
          type="translate"
          values="0 0; 0 20; 0 0"
          begin="0.2s"
          dur="0.6s"
          repeatCount="indefinite" />
      </rect>
      <rect x="48" y="0" width="7" height="30" fill="#fff">
        <animateTransform
          attributeType="xml"
          attributeName="transform"
          type="translate"
          values="0 0; 0 20; 0 0"
          begin="0.4s"
          dur="0.6s"
          repeatCount="indefinite" />
      </rect>
    </svg>
  {/if}
</a>
