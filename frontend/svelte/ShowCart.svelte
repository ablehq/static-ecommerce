<script>
  function showCart() {
    let cart = document.getElementById("cart");
    cart.classList.add("show-cart");
  }
</script>

<div
  class="absolute top-0 right-0 mt-8 mr-8 p-1 rounded-full border border-solid
  border-black hover:bg-black hover:text-white transition-all duration-200">
  <a href="#" on:click={showCart} class="flex font-bold uppercase text-sm px-2">
    View Cart
  </a>
</div>
