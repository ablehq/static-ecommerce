import { writable, derived } from "svelte/store";
import { cart as cartApi } from "../api";
import { CartVisibilityFSM } from "./FSM";
import { interpret } from "xstate";
let fsmService = interpret(CartVisibilityFSM)
  .onTransition(state => {
    console.log("================", state.value);
  })
  .start();

function createCartStatus() {
  const { subscribe, set } = writable({
    status: "unknown",
  });
  return {
    subscribe,
    restore: () => {
      set({
        status: "in-progress",
      });
      cartApi.fetch().then(val => {
        setTimeout(() => {
          set({
            status: "restored",
          });
          console.log("Restored:", val);
          cart.restore(val);
          fsmService.send("show");
        }, 1500);
      });
    },
  };
}

function createCart() {
  const { subscribe, set, update } = writable({});
  return {
    subscribe,
    addProduct: product => {
      const productId = `${product.id}`;
      update(prevCart => {
        const existing =
          prevCart.included &&
          prevCart.included.length > 0 &&
          prevCart.included.find(
            lineItem => lineItem.relationships.variant.data.id === productId,
          );
        if (existing) {
          // set quantity
          cartApi
            .setQuantity(existing.id, existing.attributes.quantity + 1)
            .then(cart => set(cart));
        } else {
          cartApi.addItem(productId).then(cart => set(cart));
        }
        return prevCart;
      });
    },
    increaseQuantity: product => {
      const productId = `${product.id}`;
      update(prevCart => {
        const existing =
          prevCart.included &&
          prevCart.included.length > 0 &&
          prevCart.included.find(
            lineItem => lineItem.relationships.variant.data.id === productId,
          );
        if (existing) {
          // set quantity
          cartApi
            .setQuantity(existing.id, existing.attributes.quantity + 1)
            .then(cart => set(cart));
        } else {
          cartApi.addItem(productId).then(cart => set(cart));
        }
        return prevCart;
      });
    },
    decreaseQuantity: product => {
      const productId = `${product.id}`;
      update(prevCart => {
        const existing =
          prevCart.included &&
          prevCart.included.length > 0 &&
          prevCart.included.find(
            lineItem => lineItem.relationships.variant.data.id === productId,
          );
        if (existing) {
          // set quantity
          const quantity = existing.attributes.quantity - 1;
          if (quantity === 0) {
            cartApi.removeLineItem(existing.id).then(cart => set(cart));
          } else {
            cartApi.setQuantity(existing.id, quantity).then(cart => set(cart));
          }
        }
        return prevCart;
      });
    },
    removeProduct: product => {
      const productId = `${product.id}`;
      update(prevCart => {
        const existing =
          prevCart.included &&
          prevCart.included.length > 0 &&
          prevCart.included.find(
            lineItem => lineItem.relationships.variant.data.id === productId,
          );
        if (existing) {
          cartApi.removeLineItem(existing.id).then(cart => set(cart));
        }
        return prevCart;
      });
    },
    reset: () => {
      cartApi.empty().then(() => {
        set({});
      });
    },
    restore: cart => {
      set(cart);
    },
  };
}

export const cart = createCart();
export const cartStatus = createCartStatus();

export const isCartRestored = derived(
  cartStatus,
  $cartStatus => $cartStatus.status === "restored",
);

export const displayCart = derived(cart, $cart => {
  const lineItems = $cart.included;

  if (lineItems) {
    const products = lineItems.map(item => {
      return {
        product: {
          id: item.relationships.variant.data.id,
          name: item.attributes.name,
          price: item.attributes.price,
        },
        quantity: item.attributes.quantity,
        total: item.attributes.total,
      };
    });
    return products;
  }
  return [];
});
cartStatus.restore();
