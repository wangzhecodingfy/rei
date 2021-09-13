// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

struct Create2Info {
    bytes32 salt;
    bytes32 deployCodeHash;
    bytes32 codeHash;
}

/**
 * @dev see {ContractFee}
 */
interface IContractFee {
    function feeOf(address contractAddress) external view returns (uint256);

    function creatorOf(address contractAddress) external view returns (address);

    function register(
        address from,
        bool[] calldata flags,
        uint256[] calldata nonces,
        Create2Info[] calldata infos
    ) external;

    function setFee(address contractAddress, uint256 fee) external;
}
