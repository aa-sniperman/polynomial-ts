// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "./Pairing.sol";
import {Constants} from "./Constants.sol";

contract PCSMultiproofs is Constants {
    using Pairing for *;

    function hashPointAndScalarList(
        Pairing.G1Point[] memory points,
        uint256[] memory scalars
    ) internal pure returns (uint256) {
        uint256 pointLength = points.length;
        uint256 scalarLength = scalars.length;
        uint256[] memory input = new uint256[](pointLength * 2 + scalarLength);
        for (uint256 i = 0; i < pointLength; i++) {
            input[i * 2] = points[i].X;
            input[i * 2 + 1] = points[i].Y;
        }
        for (uint256 i = 0; i < scalarLength; i++) {
            input[i + pointLength * 2] = scalars[i];
        }
        uint256 hashedData = uint256(keccak256(abi.encode(input)));
        return hashedData % BABYJUB_P;
    }

    function calculate_zs(uint256[] memory indexes)
        internal
        view
        returns (uint256[] memory)
    {
        uint256[] memory zs = new uint256[](indexes.length);
        for (uint256 i = 0; i < indexes.length; i++) {
            zs[i] = DOMAIN[indexes[i]];
        }
        return zs;
    }

    function calculate_r_t(
        uint256[] memory ys,
        uint256[] memory zs,
        Pairing.G1Point[] memory Cs,
        Pairing.G1Point memory D
    ) internal pure returns (uint256 r, uint256 t) {
        uint256 pcs_length = zs.length;
        uint256[] memory scalarsToHash = new uint256[](2 * pcs_length);
        for (uint256 i = 0; i < pcs_length; i++) {
            scalarsToHash[i] = ys[i];
            scalarsToHash[i + pcs_length] = zs[i];
        }

        r = hashPointAndScalarList(Cs, scalarsToHash);

        Pairing.G1Point[] memory Dlist = new Pairing.G1Point[](1);
        Dlist[0] = D;
        uint256[] memory rlist = new uint256[](1);
        rlist[0] = r;

        t = hashPointAndScalarList(Dlist, rlist);
    }

    function calculate_rtz(
        uint256 r,
        uint256 t,
        uint256[] memory zs
    ) internal view returns (uint256[] memory) {
        uint256[] memory rtz = new uint256[](zs.length);
        uint256 acc = 1;
        for (uint256 i = 0; i < zs.length; i++) {
            uint256 inverse_tz = Pairing.inverse(
                Pairing.submod(t, zs[i], BABYJUB_P),
                BABYJUB_P
            );
            rtz[i] = mulmod(acc, inverse_tz, BABYJUB_P);
            acc = mulmod(acc, r, BABYJUB_P);
        }
        return rtz;
    }

    function calculate_g2t(uint256[] memory ys, uint256[] memory rtz)
        internal
        pure
        returns (uint256 g2t)
    {
        g2t = 0;
        for (uint256 i = 0; i < ys.length; i++) {
            g2t = addmod(g2t, mulmod(ys[i], rtz[i], BABYJUB_P), BABYJUB_P);
        }
        return g2t;
    }

    function calculate_E(Pairing.G1Point[] memory Cs, uint256[] memory rtz)
        internal
        view
        returns (Pairing.G1Point memory)
    {
        // TODO: use Pippenger algorithm instead

        Pairing.G1Point memory E = Pairing.scalar_mul(Cs[0], rtz[0]);
        for (uint256 i = 1; i < Cs.length; i++) {
            E = Pairing.addition(E, Pairing.scalar_mul(Cs[i], rtz[i]));
        }
        return E;
    }

    function validate_Pairing(
        Pairing.G1Point memory E,
        Pairing.G1Point memory D,
        Pairing.G1Point memory Y,
        Pairing.G1Point memory Pi,
        uint256 t
    ) internal view returns (bool) {
        // e(E - D - Y, G2.g) == e(pi, (s - t) * G2.g)
        // e(E - D - Y, G2.g) * e(-pi, xCommit - t * G2.g) == 1
        // e(E - D - Y, G2.g) * e(-pi, xCommit) * e(pi, t * G2.g) == 1
        // e(E - D - Y, G2.g) * e(-pi, xCommit) * e(pi * t, G2.g) == 1
        // e(E - D - Y + pi * t, G2.g) * e(-pi, xCommit) == 1

        // xCommit
        Pairing.G2Point memory xCommit = Pairing.G2Point(
            [SRS_G2_X[0], SRS_G2_X[1]],
            [SRS_G2_Y[0], SRS_G2_Y[1]]
        );

        Pairing.G1Point memory a1 = E;
        a1 = Pairing.addition(a1, Pairing.negate(D));
        a1 = Pairing.addition(a1, Pairing.negate(Y));
        a1 = Pairing.addition(a1, Pairing.scalar_mul(Pi, t));

        return
            Pairing.pairingProd2(a1, Pairing.P2(), Pairing.negate(Pi), xCommit);
    }

    /**
        indexes: number[],
        ys: Fr[],
        Cs: Commitment[],
        proof: PCSMultiproofs
    */
    function verifyPCS(
        uint256[] memory indexes,
        uint256[] memory ys,
        Pairing.G1Point[] memory Cs,
        Pairing.G1Point memory Pi,
        Pairing.G1Point memory D
    ) external view returns (bool) {
        uint256 pcs_length = indexes.length;
        require(pcs_length > 0, "PCSMultiproofs: invalid pcs length");
        require(
            ys.length == pcs_length,
            "PCSMultiproofs: ys length does not match"
        );
        require(
            Cs.length == pcs_length,
            "PCSMultiproofs: Cs length does not match"
        );

        uint256[] memory zs = calculate_zs(indexes);

        (uint256 r, uint256 t) = calculate_r_t(ys, zs, Cs, D);

        uint256[] memory rtz = calculate_rtz(r, t, zs);

        uint256 g2t = calculate_g2t(ys, rtz);

        Pairing.G1Point memory E = calculate_E(Cs, rtz);

        Pairing.G1Point memory Y = Pairing.scalar_mul(Pairing.P1(), g2t);

        return validate_Pairing(E, D, Y, Pi, t);
    }
}
