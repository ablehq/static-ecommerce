import { CartVisibilityFSM } from "../stores/FSM";
import { interpret } from "xstate";
let service = interpret(CartVisibilityFSM).onTransition(state => {
  console.log(state.value);
});
describe("Cart visibility states", () => {
  beforeEach(() => {
    service = interpret(CartVisibilityFSM).onTransition(state => {
      console.log(state.value);
    });
    service.start();
  });
  it("should transition from closed to show", () => {
    let nextState = service.send("hey");
    expect(nextState.value).toBe("closed");
    nextState = service.send("show", {
      name: "value",
    });
    expect(nextState.value).toBe("listing");
  });
  afterEach(() => {
    service.stop();
  });
});
