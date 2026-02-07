// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BrimdexParimutuelMarket.sol";
import "./BrimdexParimutuelToken.sol";

/// @title BrimdexParimutuelMarketFactory
/// @notice Factory for creating parimutuel markets
contract BrimdexParimutuelMarketFactory is Ownable {
    using SafeERC20 for IERC20;
    address public immutable collateralToken; // USDC
    address[] public markets;

    mapping(address => bool) public isMarket;
    mapping(address => address) public marketToBoundToken;
    mapping(address => address) public marketToBreakToken;
    
    // Track active markets by name+timeframe to prevent duplicates
    // Key: keccak256(abi.encodePacked(name, timeframeDuration))
    // Value: market address (address(0) if no active market)
    mapping(bytes32 => address) public activeMarkets;

    event MarketCreated(
        address indexed market,
        address indexed boundToken,
        address indexed breakToken,
        string name,
        uint256 lowerBound,
        uint256 upperBound,
        uint256 expiryTimestamp
    );

    constructor(address _collateralToken, address _owner) Ownable(_owner) {
        collateralToken = _collateralToken;
    }

    /// @notice Create a new parimutuel market
    /// @param name Asset name (max 8 characters, e.g., "ETH", "BTC", "SOL")
    /// @param timeframeDuration Duration in seconds (e.g., 86400 for 24h, 604800 for 7d)
    /// @param startPrice Price at market creation (6 decimals) - used for display
    function createMarket(
        string memory name,
        uint256 lowerBound,
        uint256 upperBound,
        uint256 expiryTimestamp,
        uint256 timeframeDuration,
        uint256 startPrice,
        string memory boundTokenName,
        string memory boundTokenSymbol,
        string memory breakTokenName,
        string memory breakTokenSymbol
    ) external onlyOwner returns (address market, address boundToken, address breakToken) {
        require(bytes(name).length > 0 && bytes(name).length <= 8, "Name must be 1-8 characters");
        
        // Check for duplicate active markets (only for short-term markets ≤ 24h)
        if (timeframeDuration <= 86400) { // 24 hours in seconds
            bytes32 marketKey = keccak256(abi.encodePacked(name, timeframeDuration));
            address existingMarket = activeMarkets[marketKey];
            
            if (existingMarket != address(0)) {
                // Check if existing market is still active (not settled and not expired)
                BrimdexParimutuelMarket existing = BrimdexParimutuelMarket(existingMarket);
                
                // Access struct fields individually (public struct returns tuple)
                // Order: name, lowerBound, upperBound, expiryTimestamp, creationTimestamp, startPrice, initialized, settled
                (,,,uint256 existingExpiry,,,bool _initialized,bool existingSettled) = existing.marketConfig();
                
                // If not settled and not expired, reject creation
                if (!existingSettled && existingExpiry > block.timestamp) {
                    revert("Active market already exists for this name+timeframe");
                }
            }
            
            // Mark this as the active market
            activeMarkets[marketKey] = address(0); // Will be set after deployment
        }
        // Deploy tokens
        boundToken = address(new BrimdexParimutuelToken(boundTokenName, boundTokenSymbol, address(this)));
        breakToken = address(new BrimdexParimutuelToken(breakTokenName, breakTokenSymbol, address(this)));

        // Deploy market
        market = address(new BrimdexParimutuelMarket(
            collateralToken,
            boundToken,
            breakToken,
            msg.sender,
            address(this)
        ));

        // Transfer token ownership to market
        BrimdexParimutuelToken(boundToken).transferOwnership(market);
        BrimdexParimutuelToken(breakToken).transferOwnership(market);

        // Pull bootstrap USDC from owner and send to market
        // Owner must have approved this factory to spend USDC
        uint256 bootstrapAmount = 20_000_000; // $20 (10 + 10) in 6 decimals
        IERC20(collateralToken).safeTransferFrom(msg.sender, market, bootstrapAmount);

        // Initialize market (will use USDC already sent to it)
        BrimdexParimutuelMarket(market).initialize(
            name,
            lowerBound,
            upperBound,
            expiryTimestamp,
            startPrice
        );

        // Register
        markets.push(market);
        isMarket[market] = true;
        marketToBoundToken[market] = boundToken;
        marketToBreakToken[market] = breakToken;
        
        // Update active market mapping for short-term markets
        if (timeframeDuration <= 86400) {
            bytes32 marketKey = keccak256(abi.encodePacked(name, timeframeDuration));
            activeMarkets[marketKey] = market;
        }

        emit MarketCreated(
            market,
            boundToken,
            breakToken,
            name,
            lowerBound,
            upperBound,
            expiryTimestamp
        );
    }

    /// @notice Get all markets
    function getAllMarkets() external view returns (address[] memory) {
        return markets;
    }

    /// @notice Get market count
    function getMarketCount() external view returns (uint256) {
        return markets.length;
    }
}
