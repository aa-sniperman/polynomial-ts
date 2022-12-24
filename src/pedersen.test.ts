import {
  calculatePedersenProof,
  commitPedersen,
  verifyPedersen,
} from "./caulk/pedersen";
import { expect } from "chai";
import { Fr, PesersenParameters, setupParams } from "./global";
import { randomFr } from "./utils";

describe("Test pedersen commitment", async () => {
  it("setup globla", async () => {
    await setupParams();
  });
  let h: Fr;
  let pParams: PesersenParameters;
  it("trusted setup", () => {
    const Fr = bn128.Fr;
    const G1 = bn128.G1;
    h = Fr.e("8403279217492432511543514612414");
    const H = G1.timesFr(G1.one, h);
    pParams = { H };
  });
  it("test verify pedersen commitment", () => {
    const v = randomFr();
    const r = randomFr();
    const cm = commitPedersen(pParams, v, r);
    const proof = calculatePedersenProof(pParams, v, r);
    const valid = verifyPedersen(pParams, cm, proof);
    expect(valid).to.be.true;
  });
});
