import { utils } from "ethers";
import { Fr, G1Point, SCALAR_FIELD } from "./global";
import { G1Calldata } from "./utils";

export const hashPointToScalar = (point: G1Point): Fr => {
  const G1 = bn128.G1;
  const pointObj = G1.toObject(G1.toAffine(point));
  const abiCoder = utils.defaultAbiCoder;
  const dataToHash = abiCoder.encode(
    ["uint256", "uint256"],
    [pointObj[0].toString(), pointObj[1].toString()]
  );
  const hashedData = utils.keccak256(dataToHash);
  const scalar = BigInt(hashedData) % SCALAR_FIELD;
  return bn128.Fr.e(scalar);
};

export const hashPointAndScalarList = (
  points: G1Point[],
  scalars: Fr[]
): Fr => {
  const Fr = bn128.Fr;
  const pointsCalldata = points.map((point) => G1Calldata(point));
  const scalarsCalldata = scalars.map((scalar) =>
    Fr.toObject(scalar).toString()
  );
  let input = [];
  for (let i = 0; i < points.length; i++) {
    input.push(pointsCalldata[i].X);
    input.push(pointsCalldata[i].Y);
  }

  for (let i = 0; i < scalars.length; i++) {
    input.push(scalarsCalldata[i]);
  }

  const abi = utils.defaultAbiCoder;
  const dataToHash = abi.encode(["uint256[]"], [input]);
  const hashedData = utils.keccak256(dataToHash);
  const scalar = BigInt(hashedData) % SCALAR_FIELD;
  return bn128.Fr.e(scalar);
};

export function hashMerkleTree(left: Fr, right: Fr): Fr{
  return hashPointAndScalarList([], [left, right])
}