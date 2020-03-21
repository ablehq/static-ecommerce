import { Machine } from "xstate";

export const CartVisibilityFSM = Machine(
  {
    id: "cart",
    initial: "closed",
    context: {},
    states: {
      closed: {
        on: {
          show: {
            target: "listing",
            actions: ["showListing"],
          },
        },
      },
      listing: {
        on: {
          close: "closed",
          checkout: {
            target: "shipment",
          },
        },
      },
      shipment: {
        on: {
          close: "closed",
          back: "listing",
          pay: "payment",
        },
      },
      payment: {
        on: {
          close: "closed",
          back: "shipment",
          failed: "order_failed",
          confirm: "",
        },
      },
      order_confirmed: {
        on: {
          close: "closed",
        },
      },
      order_failed: {
        on: {
          close: "closed",
        },
      },
    },
  },
  {
    actions: {
      showListing: (context, event) => {
        console.log("================");
        console.log(context, event);
        console.log("================");
      },
    },
  },
);
