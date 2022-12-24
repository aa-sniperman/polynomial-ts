import { Coefficients, Fr, KZGParameters, setupParams } from "./global";
import { commitCoefficients } from "./kzg/kzg";
import {
  singleOpening,
  twiceOpening,
  verifySingleOpening,
  verifyTwiceOpening,
} from "./kzg/outside-domain-kzg";
import { trustedSetup } from "./kzg/srs/trusted-setup";
import { randomFr } from "./utils";
import { expect } from "chai";

describe("test outside domain kzg", async () => {
  it("setup params", async () => {
    await setupParams();
  });
  let depth = 1 << 8;
  let s: Fr;
  let params: KZGParameters;
  it("trusted setup", () => {
    s = randomFr();
    params = trustedSetup(s, depth);
  });
  it("test single opening", async () => {
    let polA: Coefficients = [];
    for (let i = 0; i < depth; i++) {
      polA.push(randomFr());
    }
    const C = await commitCoefficients(params, polA);
    const x = randomFr();

    const opening = await singleOpening(params, polA, x);
    const valid = await verifySingleOpening(params, C, x, opening);
    expect(valid).to.be.true;
  });
  it("test twice opening", async () => {
    let polA: Coefficients = [];
    for (let i = 0; i < depth; i++) {
      polA.push(randomFr());
    }
    const C = await commitCoefficients(params, polA);
    const point1 = randomFr();
    const point2 = randomFr();
    const opening = await twiceOpening(params, polA, point1, point2);
    const valid = await verifyTwiceOpening(params, C, point1, point2, opening);
    expect(valid).to.be.true;
    const point3 = randomFr();
    const valid1 = await verifyTwiceOpening(params, C, point1, point3, opening);
    expect(valid1).to.be.false;
  });
});
