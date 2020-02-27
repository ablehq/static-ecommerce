import AddToCart from "./AddToCart.svelte";
import Cart from "./Cart.svelte";
import ShowCart from "./ShowCart.svelte";

const items = document.querySelectorAll(".product");
items.forEach(item => {
  new AddToCart({
    target: item.querySelector(".product-info"),
    props: {
      product: item.dataset
    }
  });
});

const cart = document.querySelector("#cart");
new Cart({
  target: cart,
  props: {}
});

const showCart = document.querySelector("#header");
new ShowCart({
  target: showCart,
  props: {}
});
export default app;
