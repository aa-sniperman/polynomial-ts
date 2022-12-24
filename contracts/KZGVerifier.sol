// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "./Pairing.sol";
import {Constants} from "./Constants.sol";

contract Verifier is Constants {
    using Pairing for *;

    /*
     * Verifies a single-point evaluation of a polynominal using the KZG
     * commitment scheme.
     *    - p(X) is a polynominal
     *    - _value = p(_index)
     *    - commitment = commit(p)
     *    - proof = genProof(p, _index, _value)
     * Returns true if and only if the following holds, and returns false
     * otherwise:
     *     e(commitment - commit([_value]), G2.g) == e(proof, commit([0, 1]) - zCommit)
     * @param _commitment The KZG polynominal commitment.
     * @param _proof The proof.
     * @param _index The index of element in the vector.
     * @param _value The result of the polynominal evaluation.
     */
    function verify(
        Pairing.G1Point memory _commitment,
        Pairing.G1Point memory _proof,
        uint256 _index,
        uint256 _value
    ) external view returns (bool) {
        // Make sure each parameter is less than the prime q
        require(
            _commitment.X < BABYJUB_P,
            "Verifier.verifyKZG: _commitment.X is out of range"
        );
        require(
            _commitment.Y < BABYJUB_P,
            "Verifier.verifyKZG: _commitment.Y is out of range"
        );
        require(
            _proof.X < BABYJUB_P,
            "Verifier.verifyKZG: _proof.X is out of range"
        );
        require(
            _proof.Y < BABYJUB_P,
            "Verifier.verifyKZG: _proof.Y is out of range"
        );
        require(
            _index < DOMAIN.length,
            "Verifier.verifyKZG: _index is out of range"
        );
        require(
            _value < BABYJUB_P,
            "Verifier.verifyKZG: _value is out of range"
        );

        // Check that
        //     e(commitment - aCommit, G2.g) == e(proof, xCommit - zCommit)
        //     e(commitment - aCommit, G2.g) / e(proof, xCommit - zCommit) == 1
        //     e(commitment - aCommit, G2.g) * e(proof, xCommit - zCommit) ^ -1 == 1
        //     e(commitment - aCommit, G2.g) * e(-proof, xCommit - zCommit) == 1
        //     e(commitment - aCommit, G2.g) * e(-proof, xCommit) * e(-proof, -zCommit) == 1
        //     e(commitment - aCommit, G2.g) * e(-proof, xCommit) * e(proof, zCommit) == 1
        //     e(commitment - aCommit, G2.g) * e(-proof, xCommit) * e(proof * Domain[_index] , G2.g) == 1
        //     e(commitment - aCommit + proof * Domain[_index], G2.g) * e(-proof, xCommit) == 1
        // where:
        //     aCommit = commit([_value]) = G1.g * _value
        //     xCommit = commit([0, 1]) = SRS_G2_1
        //     zCommit = G2.g * Domain[_index]

        // Compute commitment - aCommitment
        Pairing.G1Point memory commitmentMinusA = Pairing.addition(
            _commitment,
            Pairing.negate(Pairing.scalar_mul(Pairing.P1(), _value))
        );

        // Negate the proof
        Pairing.G1Point memory negProof = Pairing.negate(_proof);

        // proof * Domain[_index]
        Pairing.G1Point memory proofMulDomain = Pairing.scalar_mul(
            _proof,
            DOMAIN[_index]
        );

        // xCommit
        Pairing.G2Point memory xCommit = Pairing.G2Point(
            [SRS_G2_X[0], SRS_G2_X[1]],
            [SRS_G2_Y[0], SRS_G2_Y[1]]
        );

        // Returns true if and only if
        // e(commitment - aCommit + proof * Domain[_index], G2.g) * e(-proof, xCommit) == 1
        return
            Pairing.pairingProd2(
                Pairing.addition(commitmentMinusA, proofMulDomain),
                Pairing.P2(),
                negProof,
                xCommit
            );
    }
}
