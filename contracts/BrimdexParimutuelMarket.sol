// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BrimdexParimutuelToken.sol";

/// @title BrimdexParimutuelMarket
/// @notice Parimutuel betting market for crypto price ranges
/// @dev Users buy BOUND/BREAK tokens, winners split the pool at settlement
contract BrimdexParimutuelMarket is Ownable {
    using SafeERC20 for IERC20;

    // Market configuration
    struct MarketConfig {
        string name;               // Asset name (max 8 characters, e.g., "ETH", "BTC", "SOL")
        uint256 lowerBound;        // Lower price bound (6 decimals)
        uint256 upperBound;        // Upper price bound (6 decimals)
        uint256 expiryTimestamp;   // Market expiry time
        uint256 creationTimestamp; // When market was created
        uint256 startPrice;        // Price at market creation (6 decimals)
        bool initialized;          // Market initialized
        bool settled;              // Market settled
    }

    MarketConfig public marketConfig;

    // Collateral token (USDC)
    IERC20 public immutable collateralToken;

    // BOUND and BREAK tokens (ERC20)
    BrimdexParimutuelToken public immutable boundToken;
    BrimdexParimutuelToken public immutable breakToken;

    // Factory address (can initialize)
    address public immutable factory;

    // Pools (in USDC, 6 decimals)
    uint256 public boundPool;
    uint256 public breakPool;

    // Settlement state
    uint256 public redemptionRate; // For winning side (1e18 precision)
    bool public boundWins;

    // Fee: 2% (200 basis points)
    uint256 public constant FEE_BPS = 200;
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Bootstrap amounts (6 decimals)
    uint256 public constant BOOTSTRAP_BOUND = 10_000_000; // $10
    uint256 public constant BOOTSTRAP_BREAK = 10_000_000; // $10

    // Events
    event MarketInitialized(
        string name,
        uint256 lowerBound,
        uint256 upperBound,
        uint256 expiryTimestamp
    );
    event BoundPurchased(address indexed buyer, uint256 amount, uint256 tokens, uint256 price);
    event BreakPurchased(address indexed buyer, uint256 amount, uint256 tokens, uint256 price);
    event MarketSettled(bool boundWins, uint256 totalPool, uint256 winnings);
    event TokensRedeemed(address indexed user, uint256 tokens, uint256 payout);

    constructor(
        address _collateralToken,
        address _boundToken,
        address _breakToken,
        address _owner,
        address _factory
    ) Ownable(_owner) {
        collateralToken = IERC20(_collateralToken);
        boundToken = BrimdexParimutuelToken(_boundToken);
        breakToken = BrimdexParimutuelToken(_breakToken);
        factory = _factory;
    }

    /// @notice Initialize the market
    function initialize(
        string memory _name,
        uint256 _lowerBound,
        uint256 _upperBound,
        uint256 _expiryTimestamp,
        uint256 _startPrice
    ) external {
        require(msg.sender == factory || msg.sender == owner(), "Not authorized");
        require(!marketConfig.initialized, "Already initialized");
        require(_expiryTimestamp > block.timestamp, "Invalid expiry");
        require(_lowerBound < _upperBound, "Invalid bounds");
        require(bytes(_name).length > 0 && bytes(_name).length <= 8, "Name must be 1-8 characters");

        marketConfig = MarketConfig({
            name: _name,
            lowerBound: _lowerBound,
            upperBound: _upperBound,
            expiryTimestamp: _expiryTimestamp,
            creationTimestamp: block.timestamp,
            startPrice: _startPrice,
            initialized: true,
            settled: false
        });

        // Bootstrap: mint initial tokens to burn address
        address burnAddress = address(0x000000000000000000000000000000000000dEaD);
        
        // Verify that bootstrap USDC was already sent to this contract by factory
        // Factory sends USDC before calling initialize, so we just check balance
        uint256 requiredBootstrap = BOOTSTRAP_BOUND + BOOTSTRAP_BREAK;
        require(
            collateralToken.balanceOf(address(this)) >= requiredBootstrap,
            "Insufficient bootstrap funds"
        );
        
        // Mint bootstrap tokens
        boundToken.mint(burnAddress, BOOTSTRAP_BOUND);
        breakToken.mint(burnAddress, BOOTSTRAP_BREAK);
        
        // Initialize pools
        boundPool = BOOTSTRAP_BOUND;
        breakPool = BOOTSTRAP_BREAK;

        emit MarketInitialized(_name, _lowerBound, _upperBound, _expiryTimestamp);
    }

    /// @notice Buy BOUND tokens
    /// @param amount Amount of USDC to spend (6 decimals)
    function buyBound(uint256 amount) external {
        require(marketConfig.initialized, "Not initialized");
        require(!marketConfig.settled, "Market settled");
        require(block.timestamp < marketConfig.expiryTimestamp, "Market expired");
        require(amount > 0, "Amount must be > 0");

        // Transfer USDC from user
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        // Calculate current price
        uint256 totalPool = boundPool + breakPool;
        uint256 price = (boundPool * 1e18) / totalPool; // 18 decimals for precision

        // Calculate tokens to mint
        uint256 tokens = (amount * 1e18) / price; // 18 decimals
        tokens = tokens / 1e12; // Convert to 6 decimals (token decimals)

        // Mint tokens to user
        boundToken.mint(msg.sender, tokens);

        // Update pool
        boundPool += amount;

        emit BoundPurchased(msg.sender, amount, tokens, price);
    }

    /// @notice Buy BREAK tokens
    /// @param amount Amount of USDC to spend (6 decimals)
    function buyBreak(uint256 amount) external {
        require(marketConfig.initialized, "Not initialized");
        require(!marketConfig.settled, "Market settled");
        require(block.timestamp < marketConfig.expiryTimestamp, "Market expired");
        require(amount > 0, "Amount must be > 0");

        // Transfer USDC from user
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        // Calculate current price
        uint256 totalPool = boundPool + breakPool;
        uint256 price = (breakPool * 1e18) / totalPool; // 18 decimals for precision

        // Calculate tokens to mint
        uint256 tokens = (amount * 1e18) / price; // 18 decimals
        tokens = tokens / 1e12; // Convert to 6 decimals (token decimals)

        // Mint tokens to user
        breakToken.mint(msg.sender, tokens);

        // Update pool
        breakPool += amount;

        emit BreakPurchased(msg.sender, amount, tokens, price);
    }

    /// @notice Settle the market
    /// @param finalPrice Final price from oracle (6 decimals)
    function settle(uint256 finalPrice) external onlyOwner {
        require(marketConfig.initialized, "Not initialized");
        require(!marketConfig.settled, "Already settled");
        require(block.timestamp >= marketConfig.expiryTimestamp, "Not expired");

        // Determine winner
        boundWins = (finalPrice >= marketConfig.lowerBound && finalPrice <= marketConfig.upperBound);
        marketConfig.settled = true;

        // Calculate winnings (after 2% fee)
        uint256 totalPool = boundPool + breakPool;
        uint256 fee = (totalPool * FEE_BPS) / BPS_DENOMINATOR;
        uint256 winnings = totalPool - fee;

        // Calculate redemption rate for winning side
        if (boundWins) {
            uint256 totalBoundSupply = boundToken.totalSupply();
            if (totalBoundSupply > 0) {
                redemptionRate = (winnings * 1e18) / totalBoundSupply;
            }
        } else {
            uint256 totalBreakSupply = breakToken.totalSupply();
            if (totalBreakSupply > 0) {
                redemptionRate = (winnings * 1e18) / totalBreakSupply;
            }
        }

        // Transfer fee to owner
        if (fee > 0) {
            collateralToken.safeTransfer(owner(), fee);
        }

        emit MarketSettled(boundWins, totalPool, winnings);
    }

    /// @notice Redeem winning tokens for USDC
    /// @param isBound True if redeeming BOUND tokens, false for BREAK
    /// @param amount Amount of tokens to redeem
    function redeem(bool isBound, uint256 amount) external {
        require(marketConfig.settled, "Not settled");
        require(redemptionRate > 0, "No redemption rate set");
        require(amount > 0, "Amount must be > 0");

        uint256 payout;

        if (isBound) {
            require(boundWins, "BOUND did not win");
            require(boundToken.balanceOf(msg.sender) >= amount, "Insufficient BOUND");
            
            // Burn tokens
            boundToken.burnFrom(msg.sender, amount);
            
            // Calculate payout
            payout = (amount * redemptionRate) / 1e18;
        } else {
            require(!boundWins, "BREAK did not win");
            require(breakToken.balanceOf(msg.sender) >= amount, "Insufficient BREAK");
            
            // Burn tokens
            breakToken.burnFrom(msg.sender, amount);
            
            // Calculate payout
            payout = (amount * redemptionRate) / 1e18;
        }

        require(payout > 0, "No payout");
        
        // Transfer USDC to user
        collateralToken.safeTransfer(msg.sender, payout);

        emit TokensRedeemed(msg.sender, amount, payout);
    }

    /// @notice Get current BOUND price (1e18 precision)
    function getBoundPrice() external view returns (uint256) {
        uint256 totalPool = boundPool + breakPool;
        if (totalPool == 0) return 5e17; // 0.5 if empty
        return (boundPool * 1e18) / totalPool;
    }

    /// @notice Get current BREAK price (1e18 precision)
    function getBreakPrice() external view returns (uint256) {
        uint256 totalPool = boundPool + breakPool;
        if (totalPool == 0) return 5e17; // 0.5 if empty
        return (breakPool * 1e18) / totalPool;
    }

    /// @notice Get estimated tokens for amount
    function getEstimatedTokens(bool isBound, uint256 amount) external view returns (uint256) {
        uint256 totalPool = boundPool + breakPool;
        if (totalPool == 0) {
            // If empty, assume 0.5 price
            return amount * 2; // 1 / 0.5 = 2
        }
        
        uint256 price = isBound 
            ? (boundPool * 1e18) / totalPool
            : (breakPool * 1e18) / totalPool;
        
        return (amount * 1e18) / price / 1e12; // Convert to 6 decimals
    }

    /// @notice Get estimated payout if side wins
    function getEstimatedPayout(bool isBound, uint256 tokens) external view returns (uint256) {
        if (marketConfig.settled) {
            // Market settled, return actual redemption
            if ((isBound && boundWins) || (!isBound && !boundWins)) {
                return (tokens * redemptionRate) / 1e18;
            }
            return 0;
        }

        // Estimate based on current pools
        uint256 totalPool = boundPool + breakPool;
        if (totalPool == 0) return 0;

        uint256 winnings = (totalPool * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        
        if (isBound) {
            uint256 totalBoundSupply = boundToken.totalSupply();
            if (totalBoundSupply == 0) return 0;
            return (tokens * winnings) / totalBoundSupply;
        } else {
            uint256 totalBreakSupply = breakToken.totalSupply();
            if (totalBreakSupply == 0) return 0;
            return (tokens * winnings) / totalBreakSupply;
        }
    }
}
