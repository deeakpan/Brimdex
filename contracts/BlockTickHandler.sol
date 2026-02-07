// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";

/// @title BlockTickHandler
/// @notice Simple handler that emits BlockTick events for off-chain subscriptions
contract BlockTickHandler is SomniaEventHandler {
    
    event BlockTick(uint256 blockNumber, uint256 timestamp);
    
    /// @notice Called by Somnia Reactivity when BlockTick system event fires
    /// @param emitter The address that emitted the event (system precompile)
    /// @param eventTopics Event topics
    /// @param data Event data
    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        // Emit simple block event - off-chain script will handle expiry checking
        emit BlockTick(block.number, block.timestamp);
    }
}
