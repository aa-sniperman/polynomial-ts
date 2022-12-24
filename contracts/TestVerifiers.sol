// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;
import "./Pairing.sol";

interface KZGVerifier {
    function verify(
        Pairing.G1Point memory _commitment,
        Pairing.G1Point memory _proof,
        uint256 _index,
        uint256 _value
    ) external view returns (bool);
}

interface PCSVerifier {
    function verifyPCS(
        uint256[] memory indexes,
        uint256[] memory ys,
        Pairing.G1Point[] memory Cs,
        Pairing.G1Point memory Pi,
        Pairing.G1Point memory D
    ) external view returns (bool);
}

contract TestVerifiers {
    mapping(uint256 => bool) public whiteList;
    uint256 public verifyTime;
    KZGVerifier private _kzgVerifier;
    PCSVerifier private _pcsVerifier;

    constructor(address _kzg, address _pcs) {
        _kzgVerifier = KZGVerifier(_kzg);
        _pcsVerifier = PCSVerifier(_pcs);
    }

    function kzgVerify(
        Pairing.G1Point memory _commitment,
        Pairing.G1Point memory _proof,
        uint256 _index,
        uint256 _value
    ) external {
        bool valid = _kzgVerifier.verify(_commitment, _proof, _index, _value);
        require(valid, "invalid kzg proof");

        verifyTime++;
    }

    function pcsVerify(
        uint256[] memory indexes,
        uint256[] memory ys,
        Pairing.G1Point[] memory Cs,
        Pairing.G1Point memory Pi,
        Pairing.G1Point memory D
    ) external {
        bool valid = _pcsVerifier.verifyPCS(indexes, ys, Cs, Pi, D);
        require(valid, "invalid pcs proof");
        verifyTime++;
    }

    function getWhiteList(uint256 index) external {
        bool isInWhiteList = whiteList[index];
        if (isInWhiteList) {
            verifyTime++;
        } else {
            verifyTime += 2;
        }
    }
}
