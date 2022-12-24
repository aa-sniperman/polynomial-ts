import {
  calculateMockSingleCaulkProof,
  MockSingleCaulkProof,
  verifyMockSingleCaulkOpening,
} from "./caulk/mock-single-caulk";
import {
  Evaluations,
  Fr,
  G1Point,
  KZGParameters,
  PesersenParameters,
  setupParams,
  UnityParameters,
} from "./global";
import { commitEvaluations } from "./kzg/kzg";
import { trustedSetup } from "./kzg/srs/trusted-setup";
import { randomFr } from "./utils";
import { expect } from "chai";
import {
  calculateSingleCaulkProof,
  verifySingleCaulkOpening,
} from "./caulk/single-caulk";
import { setupUnityParams } from "./caulk/unity";

describe("Test single caulk opening", async () => {
  it("setup global", async () => {
    await setupParams();
  });
  let logN = 8;
  let kzgDepth = 1 << logN;
  let kzgParams: KZGParameters;
  let pParams: PesersenParameters;
  let uParams: UnityParameters;
  let x: Fr;
  let h: Fr;
  it("trusted setup", async () => {
    const G1 = bn128.G1;
    x = randomFr();
    h = randomFr();

    const H = G1.timesFr(G1.one, h);
    pParams = { H };
    kzgParams = trustedSetup(x, kzgDepth);
    uParams = await setupUnityParams(logN);
  });

  let vectorC: Evaluations = [];
  it("setup vector C", () => {
    for (let i = 0; i < kzgDepth; i++) {
      vectorC.push(randomFr());
    }
  });

  let mockProof: MockSingleCaulkProof;
  let C: G1Point;

  it("commit vectorC", async () => {
    C = await commitEvaluations(kzgParams, vectorC);
  });
  it("calculate mock proof", async () => {
    mockProof = await calculateMockSingleCaulkProof(
      kzgParams,
      pParams,
      vectorC,
      111
    );
  });
  it("test verify mock single caulk opening", async () => {
    const valid = await verifyMockSingleCaulkOpening(pParams, C, mockProof);
    expect(valid).to.be.true;
  });

  it("test single caulk opening", async () => {
    const alpha = randomFr();
    const proof = await calculateSingleCaulkProof(
      kzgParams,
      pParams,
      uParams,
      vectorC,
      alpha,
      111
    );
    const valid = await verifySingleCaulkOpening(
      kzgParams,
      pParams,
      uParams,
      C,
      alpha,
      proof
    );
    expect(valid).to.be.true;
  });
});
