import { BigBuffer, getCurveFromName } from "./advance-crypto/ffjavascript.js";
import WasmCurve from "./advance-crypto/ffjavascript/wasm_curve.js";
import WasmField1 from "./advance-crypto/ffjavascript/wasm_field1.js";
import MerkleTree from "./fixed-merkle-tree/FixedMerkleTree";
import { BatchProof } from "./fixed-merkle-tree/index.js";

export type ECCPoint = WasmCurve;
export type Fr = WasmField1;

export type G1Point = WasmCurve;
export type G2Point = WasmCurve;
export type Evaluations = Fr[];
export type Coefficients = Fr[];
export type Commitment = G1Point;

export const SCALAR_FIELD = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

export interface KZGParameters {
  readonly SRS_1: G1Point[];
  readonly SRS_2: G2Point[];
  readonly SRS_1_BUFF: BigBuffer;
  readonly Domain: Fr[];
  readonly InvDomain: Fr[];
  readonly Aux: G1Point[];
  readonly Aux_BUFF: BigBuffer;
  readonly depth: number;
}
export interface PesersenParameters {
  readonly H: G1Point;
}

export interface PedersenProof {
  readonly R: G1Point;
  readonly t1: Fr;
  readonly t2: Fr;
}

export interface SingleCaulkProof {
  Z2: G2Point;
  T1: G2Point;
  S2: G2Point;
  pi_ped: PedersenProof;
  pi_unity: UnityProof;
  cm: G1Point;
}

export interface UnityParameters {
  readonly rhos: Coefficients[];
  readonly domainVn: Fr[];
  readonly domainVnScalars: Fr[];
  readonly logN: number;
  readonly prod: Coefficients;
}

export interface UnityPhase1Proof {
  F1: G1Point;
  H1: G1Point;
}
export interface UnityPhase2Proof {
  v1: Fr;
  v2: Fr;
  pi1: G1Point;
  pi2: G2Point;
}
export interface UnityProof {
  proof1: UnityPhase1Proof;
  proof2: UnityPhase2Proof;
}

export interface FRIParameters {
  domainOffset: Fr;
  maxRemainderSize: number;
  foldingFactor: number;
}

export interface FRILayer{
  evaluations: Fr[],
  merkleTree: MerkleTree
}

export interface FRIProver{
  layers: Array<FRILayer>;
  remainder: Fr[];
}

export interface FRIProofLayer{
  queryValues: Array<Fr[]>;
  merkleProof: BatchProof;
}

export interface FRIProof{
  layers: Array<FRIProofLayer>;
  remainder: Fr[];
}

declare global {
  var bn128: any;
  var logger: any;
}

export async function setupParams() {
  const bn128 = await getCurveFromName("bn128", true);
  global.bn128 = bn128;
  const logger = {
    error: (msg: string) => {
      console.log("ERROR: " + msg);
    },
    warning: (msg: string) => {
      console.log("WARNING: " + msg);
    },
    info: (msg: string) => {
      console.log("INFO: " + msg);
    },
    debug: (msg: string) => {
      console.log("DEBUG: " + msg);
    },
  };
  global.logger = logger;
}
