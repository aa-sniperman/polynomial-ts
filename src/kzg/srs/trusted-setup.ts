import assert from "assert";
import { log2 } from "../../advance-crypto/ffjavascript/utils.js";
import { BigBuffer } from "../../advance-crypto/ffjavascript.js";
import fs from "fs";
import { Fr, G1Point, G2Point, KZGParameters } from "src/global.js";

export const srsG1 = (s: Fr, depth: number): G1Point[] => {
  assert(depth > 0);

  const g1: G1Point[] = [];
  const G1 = bn128.G1;
  const Fr = bn128.Fr;

  let acc = Fr.one;

  for (let i = 0; i <= depth; i++) {
    g1.push(G1.timesFr(G1.one, acc));
    acc = Fr.mul(acc, s);
  }

  return g1;
};

export const srsG2 = (s: Fr, depth: number): G2Point[] => {
  assert(depth > 0);

  const g2: G2Point[] = [];
  const G2 = bn128.G2;
  const Fr = bn128.Fr;

  let acc = Fr.one;

  for (let i = 0; i <= 2; i++) {
    g2.push(G2.timesFr(G2.one, acc));
    acc = Fr.mul(acc, s);
  }

  return g2;
};

export function domain(depth: number): Fr[] {
  assert(depth > 0);
  if (depth <= 1) return [bn128.Fr.one];
  const bits = log2(depth - 1) + 1;

  let r = bn128.Fr.one;
  const nroots = 1 << bits;
  const domain = new Array(nroots);
  for (let j = 0; j < nroots; j++) {
    domain[j] = r;
    r = bn128.Fr.mul(r, bn128.Fr.w[bits]);
  }

  return domain;
}
export function trustedSetup(s: Fr, depth: number): KZGParameters {
  const d = domain(depth);
  console.log("done domain");
  const srs1 = srsG1(s, depth);
  console.log("done srs1");
  const srs2 = srsG2(s, depth);
  console.log("done srs2");

  const Fr = bn128.Fr;

  let invD: Fr[] = [];

  for (let i = 0; i < depth; i++) {
    invD.push(Fr.inv(Fr.sub(Fr.one, d[i])));
  }
  const srs_buff = new BigBuffer((depth + 1) * 3 * bn128.Fr.n8);
  for (let i = 0; i <= depth; i++) {
    srs_buff.set(srs1[i], i * 3 * bn128.Fr.n8);
  }

  // (s^d - 1) / d
  const A_div_d = Fr.div(Fr.sub(Fr.exp(s, depth), Fr.one), Fr.e(depth));
  const Aux: G1Point[] = [];
  for (let i = 0; i < depth; i++) {
    let aux_Fr = Fr.mul(A_div_d, Fr.div(d[i], Fr.sub(s, d[i])));
    Aux.push(bn128.G1.timesFr(bn128.G1.one, aux_Fr));
  }
  const aux_buff = new BigBuffer(depth * 3 * bn128.Fr.n8);
  for (let i = 0; i < depth; i++) {
    aux_buff.set(Aux[i], i * 3 * bn128.Fr.n8);
  }

  return {
    SRS_1: srs1,
    SRS_2: srs2,
    Domain: d,
    InvDomain: invD,
    SRS_1_BUFF: srs_buff,
    Aux,
    Aux_BUFF: aux_buff,
    depth,
  };
}

export function toJSON(params: KZGParameters, fileName: string) {
  const srs_1_json = params.SRS_1.map((point) =>
    bn128.G1.toObject(point).map((bn: BigInt) => "0x" + bn.toString(16))
  );
  const srs_2_json = params.SRS_2.map((point) =>
    bn128.G2.toObject(point).map((bn: BigInt[]) => {
      const str: string[] = [];
      for (let i = 0; i < bn.length; i++) {
        str.push("0x" + bn[i].toString(16));
      }
      return str;
    })
  );
  const domain_json = params.Domain.map(
    (w) => "0x" + bn128.Fr.toObject(w).toString(16)
  );
  const aux_json = params.Aux.map((aux) =>
    bn128.G1.toObject(aux).map((bn: BigInt) => "0x" + bn.toString(16))
  );

  const jsonObj = {
    srsG1: srs_1_json,
    srsG2: srs_2_json,
    domain: domain_json,
    aux: aux_json,
  };

  const jsonStr = JSON.stringify(jsonObj);

  try {
    fs.writeFileSync(fileName, jsonStr);
    console.log("SRS is saved");
  } catch (err) {
    console.error(err);
  }
}

export function toSolidity(
  params: KZGParameters,
  templateFile: string,
  solFile: string
) {
  const srs_g2_obj = bn128.G2.toObject(bn128.G2.toAffine(params.SRS_2[1])).map(
    (bn: BigInt[]) => {
      const str: string[] = [];
      for (let i = 0; i < bn.length; i++) {
        str.push(bn[i].toString());
      }
      return str;
    }
  );

  const SRS_G2_X = srs_g2_obj[0][1] + ",\n" + srs_g2_obj[0][0];
  const SRS_G2_Y = srs_g2_obj[1][1] + ",\n" + srs_g2_obj[1][0];

  let DOMAIN = "";
  for (let i = 0; i < params.depth; i++) {
    DOMAIN += bn128.Fr.toObject(params.Domain[i]).toString() + ",\n";
  }

  try {
    // Read the template
    let template = fs.readFileSync(templateFile).toString();

    // Replace values
    template = template.replace("// SRS_G2_X_VALUE", SRS_G2_X);
    template = template.replace("// SRS_G2_Y_VALUE", SRS_G2_Y);
    template = template.replace("// DOMAIN_VALUES", DOMAIN);

    // Write to the contract file
    fs.writeFileSync(solFile, template);
    console.log("exported solidity file");
  } catch (err) {
    console.error(err);
  }
}

export function importSRS(srsFile: string): KZGParameters {
  const srs_json = fs.readFileSync(srsFile).toString();
  const srs = JSON.parse(srs_json);
  const srs1: G1Point[] = srs.srsG1.map((point_json: string[]) =>
    bn128.G1.fromObject(point_json.map((coor: string) => BigInt(coor)))
  );
  const srs2: G2Point[] = srs.srsG2.map((point_json: string[][]) => {
    const x = point_json[0].map((x_i) => BigInt(x_i));
    const y = point_json[1].map((y_i) => BigInt(y_i));
    const z = point_json[2].map((z_i) => BigInt(z_i));
    return bn128.G2.fromObject([x, y, z]);
  });
  const domain: Fr[] = srs.domain.map((d: string) => bn128.Fr.e(d));
  const aux: G1Point[] = srs.aux.map((point_json: string[]) =>
    bn128.G1.fromObject(point_json.map((coor: string) => BigInt(coor)))
  );

  const Fr = bn128.Fr;
  const depth = domain.length;
  let invD: Fr[] = [];

  for (let i = 0; i < depth; i++) {
    invD.push(Fr.inv(Fr.sub(Fr.one, domain[i])));
  }
  const srs_buff = new BigBuffer(depth * 3 * bn128.Fr.n8);
  for (let i = 0; i < depth; i++) {
    srs_buff.set(srs1[i], i * 3 * bn128.Fr.n8);
  }

  const aux_buff = new BigBuffer(depth * 3 * bn128.Fr.n8);
  for (let i = 0; i < depth; i++) {
    aux_buff.set(aux[i], i * 3 * bn128.Fr.n8);
  }

  return {
    SRS_1: srs1,
    SRS_2: srs2,
    Domain: domain,
    InvDomain: invD,
    SRS_1_BUFF: srs_buff,
    Aux: aux,
    Aux_BUFF: aux_buff,
    depth,
  };
}
