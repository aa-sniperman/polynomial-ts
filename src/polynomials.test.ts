import { expect } from "chai";
import { Coefficients, setupParams } from "./global";
import {
  div1Degree,
  divVanishing,
  evaluate,
  mulPolynomials,
  vanishingPolynomial,
} from "./kzg/polynomial";
import { evaluate as navieEvaluate } from "./kzg/kzg";
import { randomFr } from "./utils";
import { domain } from "./kzg/srs/trusted-setup";

describe("test polynomials", async () => {
  it("setup global", async () => {
    await setupParams();
  });
  it("test evaluate", async () => {
    const Fr = bn128.Fr;
    let polA: Coefficients = [];
    for (let i = 0; i < 10; i++) {
      polA.push(randomFr());
    }
    const x = randomFr();
    const Ax = evaluate(polA, x);
    const expected_Ax = navieEvaluate(polA, x);
    expect(Fr.eq(Ax, expected_Ax)).to.be.true;
  });
  it("test mulpolynomials", async () => {
    let polA: Coefficients = [];
    let polB: Coefficients = [];
    for (let i = 0; i < 10; i++) {
      polA.push(randomFr());
    }
    for (let i = 0; i < 15; i++) {
      polB.push(randomFr());
    }
    const polM = await mulPolynomials(polA, polB);
    expect(polM.length).to.be.eq(24);

    const Fr = bn128.Fr;

    const x = randomFr();
    const Ax = evaluate(polA, x);
    const Bx = evaluate(polB, x);
    const Mx = evaluate(polM, x);

    expect(Fr.eq(Fr.mul(Ax, Bx), Mx)).to.be.true;
  });
  it("test vanishing polynomial", () => {
    const depth = 1 << 8;
    const vn = vanishingPolynomial(depth);
    const Domain = domain(depth);
    for (let i = 0; i < depth; i++) {
      expect(bn128.Fr.isZero(evaluate(vn, Domain[i]))).to.be.true;
    }
  });
  it("test div vanishing polynomial", async () => {
    const depth = 1 << 8;
    const vn = vanishingPolynomial(depth);
    const Fr = bn128.Fr;
    let polQ: Coefficients = [];
    for (let i = 0; i < 10; i++) {
      polQ.push(randomFr());
    }
    const polA = await mulPolynomials(polQ, vn);
    const expectedQ = divVanishing(polA, depth);
    expect(expectedQ.length).to.be.eq(10);
    for (let i = 0; i < 10; i++) {
      expect(Fr.eq(expectedQ[i], polQ[i])).to.be.true;
    }
  });
  it("test div degree 1 polynomial", async () => {
    let polQ: Coefficients = [];
    for (let i = 0; i < 10; i++) {
      polQ.push(randomFr());
    }
    const Fr = bn128.Fr;
    const point = randomFr();
    const polZ = [Fr.neg(point), Fr.one];
    const polA = await mulPolynomials(polQ, polZ);
    const expectedQ = div1Degree(polA, point);
    expect(expectedQ.length).to.be.eq(10);
    for (let i = 0; i < 10; i++) {
      expect(Fr.eq(expectedQ[i], polQ[i])).to.be.true;
    }
  });
});
