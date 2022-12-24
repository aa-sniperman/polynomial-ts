// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "./Pairing.sol";

contract TestPairing {
    using Pairing for *;
    function pairingProd2(
        Pairing.G1Point memory a1,
        Pairing.G2Point memory a2,
        Pairing.G1Point memory b1,
        Pairing.G2Point memory b2
    ) public view returns (bool) {
        return Pairing.pairingProd2(a1, a2, b1, b2);
    }
}
