import { Pairing } from "./typechain-types/KZGVerifier.sol/Verifier";
import crypto from "crypto";
import { Fr, G1Point } from "./global";
export function G1Calldata(g1: G1Point): Pairing.G1PointStruct {
  const G1 = bn128.G1;
  const g1Affine = G1.toAffine(g1);
  const g1Object = G1.toObject(g1Affine);
  return {
    X: g1Object[0].toString(),
    Y: g1Object[1].toString(),
  };
}
export function randomFr(): Fr {
  return bn128.Fr.e("0x" + crypto.randomBytes(32).toString("hex"));
}
