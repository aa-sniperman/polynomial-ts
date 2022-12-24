import { expect } from "chai";
import { BigBuffer, ZqField } from "./advance-crypto/ffjavascript.js";
import { Fr, G1Point, setupParams } from "./global";
import { randomFr } from "./utils";

describe("Test Bn128 FFT/IFFT", async () => {
  it("setup params", async () => {
    await setupParams();
  });
  it("It shoud do an inverse FFT in G1", async () => {
    const Fr = bn128.Fr;
    const G1 = bn128.G1;

    const a: Fr[] = [];
    for (let i = 0; i < 8; i++) a[i] = Fr.e(i + 1);

    const aG_expected: Fr[] = [];
    for (let i = 0; i < 8; i++) aG_expected[i] = G1.timesFr(G1.g, a[i]);

    const A = await bn128.Fr.fft(a);

    const AG: G1Point[] = [];
    for (let i = 0; i < 8; i++) AG[i] = G1.timesFr(G1.g, A[i]);

    const aG_calculated = await G1.ifft(AG, "jacobian", "jacobian");

    for (let i = 0; i < 8; i++) {
      console.log(G1.toObject(G1.toAffine(aG_calculated[i])));
      expect(G1.eq(aG_calculated[i], aG_expected[i])).to.be.true;
    }
  });
  it("It shoud do a big FFT/IFFT in Fr", async () => {
    const Fr = bn128.Fr;

    const N = 1 << 10;

    const a = new BigBuffer(N * bn128.Fr.n8);
    for (let i = 0; i < N; i++) {
      if (i % 100000 == 0) logger.debug(`setup ${i}/${N}`);
      const num = Fr.e(i + 1);
      a.set(num, i * bn128.Fr.n8);
    }

    const A = await bn128.Fr.fft(a, "", "", logger, "fft");
    const Ainv = await bn128.Fr.ifft(A, "", "", logger, "ifft");

    for (let i = 0; i < N; i++) {
      if (i % 100000 == 0) logger.debug(`checking ${i}/${N}`);

      let num1 = Ainv.slice(i * Fr.n8, i * Fr.n8 + Fr.n8);
      let num2 = a.slice(i * Fr.n8, i * Fr.n8 + Fr.n8);
      num1 = Fr.toObject(num1);
      num2 = Fr.toObject(num2);
      expect(num1).to.eq(num2);
    }
    console.log(Fr.n8);
  });

  it("It shoud do a big FFT/IFFT in Fr", async () => {
    const Fr = bn128.Fr;
    const N = 8192 * 16;

    const a: Fr[] = [];
    for (let i = 0; i < N; i++) a[i] = Fr.e(i + 1);

    const A = await bn128.Fr.fft(a);
    const Ainv = await bn128.Fr.ifft(A);

    for (let i = 0; i < N; i++) {
      //            console.log(Fr.toString(Ainv[i]));
      expect(Fr.eq(a[i], Ainv[i])).to.be.true;
    }
  }).timeout(3000);

  it("Test roots of unity", async () => {
    let F = new ZqField(bn128.Fr.p);
    for (let i = 0; i < F.s; i++) {
      expect(F.eq(F.square(F.w[i + 1]), F.w[i])).to.be.true;
      expect(F.eq(F.square(F.wi[i + 1]), F.wi[i])).to.be.true;
      expect(F.mul(F.w[i], F.wi[i])).to.eq(F.one);
    }
    let roots = F.FFT.roots[10];
    expect(F.pow(roots[1], 1024)).to.eq(F.one);
  });

  it("It shoud do Affine Multiexp", async () => {
    const Fr = bn128.Fr;
    const G1 = bn128.G1;
    const N = 1 << 10;

    const scalars = new BigBuffer(N * bn128.Fr.n8);
    const bases = new BigBuffer(N * G1.F.n8 * 2);
    let acc = Fr.zero;
    for (let i = 0; i < N; i++) {
      if (i % 100000 == 0) logger.debug(`setup ${i}/${N}`);
      const num = Fr.e(i + 1);
      scalars.set(Fr.fromMontgomery(num), i * bn128.Fr.n8);
      bases.set(G1.toAffine(G1.timesFr(G1.g, num)), i * G1.F.n8 * 2);
      acc = Fr.add(acc, Fr.square(num));
    }

    const accG = G1.timesFr(G1.g, acc);
    const accG2 = await G1.multiExpAffine(bases, scalars, logger, "test");

    expect(G1.eq(accG, accG2)).to.be.true;
  });

  it("It shoud do Jacobian Multiexp", async () => {
    const Fr = bn128.Fr;
    const G1 = bn128.G1;
    const N = 1 << 10;

    const scalars = new BigBuffer(N * bn128.Fr.n8);
    const bases = new BigBuffer(N * G1.F.n8 * 3);
    let acc = Fr.zero;
    for (let i = 0; i < N; i++) {
      if (i % 100000 == 0) logger.debug(`setup ${i}/${N}`);
      const num = Fr.e(i + 1);
      scalars.set(Fr.fromMontgomery(num), i * bn128.Fr.n8);
      bases.set(G1.timesFr(G1.g, num), i * G1.F.n8 * 3);
      acc = Fr.add(acc, Fr.square(num));
    }

    const accG = G1.timesFr(G1.g, acc);
    const accG2 = await G1.multiExp(bases, scalars, logger, "test");

    expect(G1.eq(accG, accG2)).to.be.true;
  });

  it("benchmark Jacobian Multiexp", async () => {
    const t1 = Date.now();
    const Fr = bn128.Fr;
    const G1 = bn128.G1;
    const N = 1 << 32;
    const scalars = new BigBuffer(N * bn128.Fr.n8);
    const bases = new BigBuffer(N * G1.F.n8 * 3);

    for (let i = 0; i < N; i++) {
      const num = randomFr();
      scalars.set(Fr.fromMontgomery(num), i * bn128.Fr.n8);
      bases.set(G1.one, i * G1.F.n8 * 3);
    }

    await G1.multiExp(bases, scalars, logger, "bench");
    const t2 = Date.now();
    console.log((t2 - t1)/ 1000)
  });
});
