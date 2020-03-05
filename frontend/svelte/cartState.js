import { writable } from "svelte/store";

export const cartStatus = writable("expandCart");
// return {
//   subscribe,
//   setStatus: () => {
//     if (state == 2) {
//       set({ status: "expandCart" });
//     } else if (state == 3) {
//       set({ status: "showPayment" });
//     } else if (state == 4) {
//       set({ status: "showConfirmation" });
//     }
//   }
// };
