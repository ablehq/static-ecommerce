import { writable, derived } from "svelte/store";
import low from "lowdb";
import LocalStorage from "lowdb/adapters/LocalStorage";

const adapter = new LocalStorage("db");
const db = low(adapter);

db.defaults({ cart: [] }).write();

function createCartStatus() {
  const { subscribe, set, update } = writable({
    status: "unknown"
  });
  return {
    subscribe,
    restore: () => {
      set({
        status: "in-progress"
      });
      const value = db.get("cart").value();
      setTimeout(() => {
        set({
          status: "restored"
        });
        cart.restore(value);
      }, 1500);
    }
  };
}

const saveCart = cart => {
  db.set("cart", cart).write();
  return cart;
};
function createCart() {
  const { subscribe, set, update } = writable([]);
  return {
    subscribe,
    addProduct: product => {
      update(prevCart => {
        const index = prevCart.findIndex(
          item => item.product.id === product.id
        );
        if (index < 0) {
          prevCart.unshift({
            product,
            quantity: 1,
            total: Number.parseInt(product.price)
          });
        } else {
          const item = prevCart[index];
          item.quantity = item.quantity + 1;
          item.total = Number.parseInt(item.product.price) * item.quantity;
        }
        return saveCart([...prevCart]);
      });
    },
    increaseQuantity: product => {
      update(prevCart => {
        const index = prevCart.findIndex(
          item => item.product.id === product.id
        );
        if (index >= 0) {
          const item = prevCart[index];
          item.quantity = item.quantity + 1;
          item.total = Number.parseInt(item.product.price) * item.quantity;
        }
        return saveCart([...prevCart]);
      });
    },
    decreaseQuantity: product => {
      update(prevCart => {
        const index = prevCart.findIndex(
          item => item.product.id === product.id
        );
        if (index >= 0) {
          const item = prevCart[index];
          if (item.quantity > 1) {
            item.quantity = item.quantity - 1;
            item.total = Number.parseInt(item.product.price) * item.quantity;
            return saveCart([...prevCart]);
          } else {
            return saveCart(
              prevCart.filter(item => item.product.id !== product.id)
            );
          }
        }
        return saveCart([...prevCart]);
      });
    },
    removeProduct: product => {
      update(prevCart => {
        return saveCart(
          prevCart.filter(item => item.product.id !== product.id)
        );
      });
    },
    reset: () => {
      set(saveCart([]));
    },
    restore: cart => {
      set(cart);
    }
  };
}

export const cart = createCart();
export const cartStatus = createCartStatus();
export const cartTotal = derived(cart, $cart =>
  $cart.reduce((total, item) => total + item.total, 0)
);
export const isCartRestored = derived(
  cartStatus,
  $cartStatus => $cartStatus.status === "restored"
);
cartStatus.restore();
