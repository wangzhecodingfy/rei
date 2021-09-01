// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "./IOnly.sol";

/**
 * @dev `DepositInfo` records the information about deposit.
 */
struct DepositInfo {
    uint256 amount;
    uint256 timestamp;
}

/**
 * @dev `DepositInfo` records the information about usage.
 *      If the timestamp interval is less than `feeRecoverInterval`, the usage will accumulate,
 *      Otherwise it will be cleared
 */
struct UsageInfo {
    uint256 usage;
    uint256 timestamp;
}

/**
 * @dev see {FeeManager}
 */
interface IFeeManager is IOnly {
    function userTotalAmount(address user) external view returns (uint256);

    function userUsage(address user) external view returns (UsageInfo memory);

    function userDeposit(address user) external view returns (DepositInfo memory);

    function delegatedUserDeposit(address user1, address user2) external view returns (DepositInfo memory);

    function totalAmount() external view returns (uint256);

    function deposit() external payable;

    function depositTo(address user) external payable;

    function withdraw(uint256 amount) external;

    function withdrawFrom(uint256 amount, address user) external;

    function estimateFee(address user) external view returns (uint256);

    function estimateUsage(UsageInfo calldata ui) external view returns (uint256 usage);

    function consume(address user, uint256 usage) external;
}
