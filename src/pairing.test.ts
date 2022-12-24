import { expect } from "chai";
import { setupParams } from "./global";
// @ts-ignore
import { ethers } from "hardhat";
import { TestPairing } from "./typechain-types/TestPairing";
import { G1Point, G2Point } from "./global";
import { Pairing } from "./typechain-types/TestPairing";
function G1Calldata(g1: G1Point): Pairing.G1PointStruct{
    const G1 = bn128.G1;
    const g1Affine = G1.toAffine(g1);
    const g1Object = G1.toObject(g1Affine);
    return {
        X: g1Object[0].toString(),
        Y: g1Object[1].toString()
    }
}
function G2Calldata(g2: G2Point): Pairing.G2PointStruct{
    const G2 = bn128.G2;
    const g2Affine = G2.toAffine(g2);
    const g2Object = G2.toObject(g2Affine);
    return {
        X: [g2Object[0][1].toString(), g2Object[0][0].toString()],
        Y: [g2Object[1][1].toString(), g2Object[1][0].toString()]
    }
}

describe("Test Pairing", async () => {
  it("setup params", async () => {
    await setupParams();
  });
  it("test pairing", () => {
    const Fr = bn128.Fr;
    const G1 = bn128.G1;
    const G2 = bn128.G2;

    const a = Fr.fromObject(BigInt(300));
    const b = Fr.fromObject(BigInt(400));
    const c = Fr.fromObject(BigInt(200));
    const d = Fr.fromObject(BigInt(600));

    expect(Fr.eq(Fr.mul(a, b), Fr.mul(c, d))).to.be.true;

    const aG1 = G1.timesFr(G1.one, a);
    const bG2 = G2.timesFr(G2.one, b);

    const cG1 = G1.timesFr(G1.one, c);
    const dG2 = G2.timesFr(G2.one, d);

    const p1 = bn128.pairing(aG1, bG2);
    const p2 = bn128.pairing(cG1, dG2);

    expect(bn128.F12.eq(p1, p2)).to.be.true;
  });

  it("test Pairing Smart Contract", async () => {
    const PairingFactory = await ethers.getContractFactory("TestPairing");
    const pairing: TestPairing = await PairingFactory.deploy();
    await pairing.deployed();

    const Fr = bn128.Fr;
    const G1 = bn128.G1;
    const G2 = bn128.G2;

    const a = Fr.fromObject(BigInt(100));
    const b = Fr.fromObject(BigInt(1200));
    const c = Fr.fromObject(BigInt(300));
    const d = Fr.fromObject(BigInt(400));

    const aG1 = G1.timesFr(G1.one, a);
    const bG2 = G2.timesFr(G2.one, b);

    const neg_cG1 = G1.neg(G1.timesFr(G1.one, c));
    const dG2 = G2.timesFr(G2.one, d);

    const test = await bn128.pairingEq(aG1, bG2, neg_cG1, dG2);
    expect(test).to.be.true;

    const aG1_Calldata = G1Calldata(aG1);
    const bG2_Calldata = G2Calldata(bG2);
    const neg_cG1_Calldata = G1Calldata(neg_cG1);
    const dG2_Calldata = G2Calldata(dG2);

    const result = await pairing.pairingProd2(aG1_Calldata, bG2_Calldata, neg_cG1_Calldata, dG2_Calldata);
    expect(result).to.be.true;
  });

  it("contract should return false", async () => {
    const PairingFactory = await ethers.getContractFactory("TestPairing");
    const pairing: TestPairing = await PairingFactory.deploy();
    await pairing.deployed();

    const Fr = bn128.Fr;
    const G1 = bn128.G1;
    const G2 = bn128.G2;

    const a = Fr.fromObject(BigInt(100));
    const b = Fr.fromObject(BigInt(1200));
    const c = Fr.fromObject(BigInt(300));
    const d = Fr.fromObject(BigInt(40));

    const aG1 = G1.timesFr(G1.one, a);
    const bG2 = G2.timesFr(G2.one, b);

    const neg_cG1 = G1.neg(G1.timesFr(G1.one, c));
    const dG2 = G2.timesFr(G2.one, d);

    const test = await bn128.pairingEq(aG1, bG2, neg_cG1, dG2);
    expect(test).to.be.false;

    const aG1_Calldata = G1Calldata(aG1);
    const bG2_Calldata = G2Calldata(bG2);
    const neg_cG1_Calldata = G1Calldata(neg_cG1);
    const dG2_Calldata = G2Calldata(dG2);

    const result = await pairing.pairingProd2(aG1_Calldata, bG2_Calldata, neg_cG1_Calldata, dG2_Calldata);
    expect(result).to.be.false;
  })
});
