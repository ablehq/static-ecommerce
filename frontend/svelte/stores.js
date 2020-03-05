import { writable, derived } from "svelte/store";
import axios from "axios";
import Cookies from "js-cookie";
import low from "lowdb";
import LocalStorage from "lowdb/adapters/LocalStorage";

const adapter = new LocalStorage("db");
const db = low(adapter);

db.defaults({ cart: [] }).write();

function getOrderToken() {
  return Cookies.get("orderToken");
}

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

  // let orderTokenProm = new Promise(resolve => {
  //   return resolve(getOrderToken());
  // });
  // orderTokenProm
  //   .then(token => {
  //     if (token) {
  //       return token;
  //     } else {
  //       return axios
  //         .post("http://localhost:3000/api/v2/storefront/cart", {})
  //         .then(response => {
  //           const orderToken = response.data.data.attributes.token;
  //           Cookies.set("orderToken", orderToken);
  //           return orderToken;
  //         });
  //     }
  //   })
  //   .then(token => {
  //     axios
  //       .get(
  //         "http://localhost:3000/api/v2/storefront/cart?include=line_items%2Cvariants%2Cvariants.images",
  //         {
  //           headers: {
  //             "X-Spree-Order-Token": token
  //           }
  //         }
  //       )
  //       .then(function(response) {
  //         const respCart = response.data;
  //         const resp = respCart.included
  //           .filter(it => it.type === "line_item")
  //           .map(it => ({
  //             quantity: it.attributes.quantity,
  //             total: it.attributes.display_total,
  //             line_item_id: it.id,
  //             product: {
  //               id: it.relationships.variant.data.id,
  //               name: it.attributes.name,
  //               price: it.attributes.display_price,
  //               image:
  //                 "http://localhost:3000/" +
  //                 respCart.included.find(
  //                   item =>
  //                     item.type === "image" &&
  //                     item.attributes.viewable_id.toString() ===
  //                       it.relationships.variant.data.id
  //                 ).attributes.styles[0].url
  //             }
  //           }));
  //         set({
  //           status: "restored"
  //         });
  //         const value = db.get("cart").value();
  //         console.log(resp);
  //         cart.restore(resp);
  //         return cart;
  //       })
  //       .catch(function(error) {
  //         console.log(error);
  //       });
  // });
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
          axios
            .post(
              "http://localhost:3000/api/v2/storefront/cart/add_item",
              {
                variant_id: product.id,
                quantity: 1
              },
              {
                headers: {
                  "X-Spree-Order-Token": getOrderToken()
                }
              }
            )
            .then(response => {});
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

export const isCartRestored = derived(
  cartStatus,
  $cartStatus => $cartStatus.status === "restored"
);
cartStatus.restore();
