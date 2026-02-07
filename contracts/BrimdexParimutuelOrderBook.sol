// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OrderBookLinkedList} from "./libraries/OrderBookLinkedList.sol";
import {OrderPriceVolumeSet} from "./libraries/OrderPriceVolumeSet.sol";
import "./BrimdexParimutuelMarketFactory.sol";

/// @title BrimdexParimutuelOrderBook
/// @notice Simple on-chain orderbook for trading BOUND/BREAK tokens
/// @dev No minting - only transfers existing tokens between users
contract BrimdexParimutuelOrderBook is Ownable {
    using SafeERC20 for IERC20;
    using OrderBookLinkedList for OrderBookLinkedList.LinkedList;
    using OrderPriceVolumeSet for OrderPriceVolumeSet.OPVset;

    IERC20 public immutable collateralToken; // USDC
    BrimdexParimutuelMarketFactory public immutable marketFactory;

    uint16 public feeRate; // Fee in basis points (e.g., 50 = 0.5%)
    uint256 public accumulatedFee;

    // Order book: market => token => price => orders
    mapping(address => mapping(address => mapping(uint256 => OrderBookLinkedList.LinkedList)))
        public sellOrderBook;
    mapping(address => mapping(address => mapping(uint256 => OrderBookLinkedList.LinkedList)))
        public buyOrderBook;

    // User orders: market => token => user => [orders]
    mapping(address => mapping(address => OrderPriceVolumeSet.OPVset)) private _sellOrders;
    mapping(address => mapping(address => OrderPriceVolumeSet.OPVset)) private _buyOrders;

    // Active prices for efficient matching: market => token => prices[]
    mapping(address => mapping(address => uint256[])) private _sellPrices;
    mapping(address => mapping(address => uint256[])) private _buyPrices;
    mapping(address => mapping(address => mapping(uint256 => bool))) private _activePrices;

    // Events
    event OrderPlaced(
        address indexed market,
        address indexed token,
        address indexed user,
        uint256 price,
        uint256 amount,
        bytes32 orderId,
        bool isBuy
    );

    event OrderMatched(
        address indexed market,
        address indexed token,
        address indexed maker,
        address taker,
        uint256 price,
        uint256 amount
    );

    event OrderCancelled(
        address indexed market,
        address indexed token,
        address indexed user,
        uint256 price,
        bytes32 orderId
    );

    constructor(
        address _collateralToken,
        address _marketFactory,
        address _owner
    ) Ownable(_owner) {
        collateralToken = IERC20(_collateralToken);
        marketFactory = BrimdexParimutuelMarketFactory(_marketFactory);
        feeRate = 50; // 0.5% fee
    }

    /// @notice Set trading fee rate
    function setFeeRate(uint16 _feeRate) external onlyOwner {
        require(_feeRate <= 1000, "Fee too high");
        feeRate = _feeRate;
    }

    /// @notice Place a sell order
    /// @param market Market contract address
    /// @param token BOUND or BREAK token address
    /// @param price Price per token in USDC (6 decimals)
    /// @param amount Amount of tokens to sell
    function placeSellOrder(
        address market,
        address token,
        uint256 price,
        uint256 amount
    ) external returns (bytes32 orderId) {
        require(marketFactory.isMarket(market), "Invalid market");
        require(
            token == marketFactory.marketToBoundToken(market) ||
            token == marketFactory.marketToBreakToken(market),
            "Invalid token for market"
        );
        require(price > 0, "Price must be > 0");
        require(amount > 0, "Amount must be > 0");

        IERC20 tokenContract = IERC20(token);

        // Transfer tokens from user to this contract
        tokenContract.safeTransferFrom(msg.sender, address(this), amount);

        // Match against existing buy orders
        uint256 remainingAmount = _matchSellOrder(market, token, price, amount);

        // If not fully filled, add to order book
        if (remainingAmount > 0) {
            if (sellOrderBook[market][token][price].length == 0) {
                orderId = sellOrderBook[market][token][price].initHead(msg.sender, remainingAmount);
                _addSellPrice(market, token, price);
            } else {
                orderId = sellOrderBook[market][token][price].addNode(msg.sender, remainingAmount);
            }

            _sellOrders[market][token]._add(msg.sender, orderId, price, remainingAmount);
            emit OrderPlaced(market, token, msg.sender, price, remainingAmount, orderId, false);
        }
    }

    /// @notice Place a buy order
    /// @param market Market contract address
    /// @param token BOUND or BREAK token address
    /// @param price Price per token in USDC (6 decimals)
    /// @param amount Amount of tokens to buy
    function placeBuyOrder(
        address market,
        address token,
        uint256 price,
        uint256 amount
    ) external returns (bytes32 orderId) {
        require(marketFactory.isMarket(market), "Invalid market");
        require(
            token == marketFactory.marketToBoundToken(market) ||
            token == marketFactory.marketToBreakToken(market),
            "Invalid token for market"
        );
        require(price > 0, "Price must be > 0");
        require(amount > 0, "Amount must be > 0");

        // Calculate USDC needed
        uint256 totalUsdc = (amount * price) / 1e6;
        uint256 fee = (totalUsdc * feeRate) / 10000;
        accumulatedFee += fee;
        uint256 netUsdc = totalUsdc + fee;

        // Transfer USDC from user
        collateralToken.safeTransferFrom(msg.sender, address(this), netUsdc);

        // Match against existing sell orders
        uint256 remainingAmount = _matchBuyOrder(market, token, price, amount);

        // If not fully filled, add to order book
        if (remainingAmount > 0) {
            uint256 remainingUsdc = (remainingAmount * price) / 1e6;

            if (buyOrderBook[market][token][price].length == 0) {
                orderId = buyOrderBook[market][token][price].initHead(msg.sender, remainingUsdc);
                _addBuyPrice(market, token, price);
            } else {
                orderId = buyOrderBook[market][token][price].addNode(msg.sender, remainingUsdc);
            }

            _buyOrders[market][token]._add(msg.sender, orderId, price, remainingUsdc);
            emit OrderPlaced(market, token, msg.sender, price, remainingAmount, orderId, true);
        }
    }

    /// @notice Cancel a sell order
    function cancelSellOrder(
        address market,
        address token,
        uint256 price,
        bytes32 orderId
    ) external {
        OrderBookLinkedList.Order memory o = sellOrderBook[market][token][price]
            .nodes[orderId]
            .order;
        require(msg.sender == o.seller, "Not order owner");

        IERC20(token).safeTransfer(msg.sender, o.amount);

        sellOrderBook[market][token][price].deleteNode(orderId);
        _sellOrders[market][token]._remove(msg.sender, orderId);
        _removePrice(market, token, price, true);

        emit OrderCancelled(market, token, msg.sender, price, orderId);
    }

    /// @notice Cancel a buy order
    function cancelBuyOrder(
        address market,
        address token,
        uint256 price,
        bytes32 orderId
    ) external {
        OrderBookLinkedList.Order memory o = buyOrderBook[market][token][price]
            .nodes[orderId]
            .order;
        require(msg.sender == o.seller, "Not order owner");

        collateralToken.safeTransfer(msg.sender, o.amount);

        buyOrderBook[market][token][price].deleteNode(orderId);
        _buyOrders[market][token]._remove(msg.sender, orderId);
        _removePrice(market, token, price, false);

        emit OrderCancelled(market, token, msg.sender, price, orderId);
    }

    /// @notice Internal: Match sell order against buy orders
    function _matchSellOrder(
        address market,
        address token,
        uint256 price,
        uint256 sellAmount
    ) internal returns (uint256 remainingAmount) {
        remainingAmount = sellAmount;
        uint256 len = buyOrderBook[market][token][price].length;

        IERC20 tokenContract = IERC20(token);

        for (uint256 i = 0; i < len && remainingAmount > 0; i++) {
            bytes32 head_ = buyOrderBook[market][token][price].head;
            uint256 buyUsdc = buyOrderBook[market][token][price].nodes[head_].order.amount;
            uint256 buyAmount = (buyUsdc * 1e6) / price;

            OrderBookLinkedList.Order memory buyOrder = buyOrderBook[market][token][price]
                .nodes[head_]
                .order;

            if (remainingAmount >= buyAmount) {
                // Full match
                buyOrderBook[market][token][price].popHead();
                _buyOrders[market][token]._remove(buyOrder.seller, head_);
                _removePrice(market, token, price, false);

                tokenContract.safeTransfer(buyOrder.seller, buyAmount);
                collateralToken.safeTransfer(msg.sender, buyUsdc);

                emit OrderMatched(market, token, buyOrder.seller, msg.sender, price, buyAmount);

                remainingAmount -= buyAmount;
            } else {
                // Partial match
                uint256 matchedUsdc = (remainingAmount * price) / 1e6;

                buyOrderBook[market][token][price].nodes[head_].order.amount -= matchedUsdc;
                _buyOrders[market][token]._subVolume(buyOrder.seller, head_, matchedUsdc);

                tokenContract.safeTransfer(buyOrder.seller, remainingAmount);
                collateralToken.safeTransfer(msg.sender, matchedUsdc);

                emit OrderMatched(market, token, buyOrder.seller, msg.sender, price, remainingAmount);

                remainingAmount = 0;
            }
        }
    }

    /// @notice Internal: Match buy order against sell orders
    function _matchBuyOrder(
        address market,
        address token,
        uint256 price,
        uint256 buyAmount
    ) internal returns (uint256 remainingAmount) {
        remainingAmount = buyAmount;
        uint256 len = sellOrderBook[market][token][price].length;

        IERC20 tokenContract = IERC20(token);

        for (uint256 i = 0; i < len && remainingAmount > 0; i++) {
            bytes32 head_ = sellOrderBook[market][token][price].head;
            uint256 sellAmount = sellOrderBook[market][token][price].nodes[head_].order.amount;

            OrderBookLinkedList.Order memory sellOrder = sellOrderBook[market][token][price]
                .nodes[head_]
                .order;

            if (remainingAmount >= sellAmount) {
                // Full match
                uint256 matchedUsdc = (sellAmount * price) / 1e6;

                sellOrderBook[market][token][price].popHead();
                _sellOrders[market][token]._remove(sellOrder.seller, head_);
                _removePrice(market, token, price, true);

                tokenContract.safeTransfer(msg.sender, sellAmount);
                collateralToken.safeTransfer(sellOrder.seller, matchedUsdc);

                emit OrderMatched(market, token, sellOrder.seller, msg.sender, price, sellAmount);

                remainingAmount -= sellAmount;
            } else {
                // Partial match
                uint256 matchedUsdc = (remainingAmount * price) / 1e6;

                sellOrderBook[market][token][price].nodes[head_].order.amount -= remainingAmount;
                _sellOrders[market][token]._subVolume(sellOrder.seller, head_, remainingAmount);

                tokenContract.safeTransfer(msg.sender, remainingAmount);
                collateralToken.safeTransfer(sellOrder.seller, matchedUsdc);

                emit OrderMatched(market, token, sellOrder.seller, msg.sender, price, remainingAmount);

                remainingAmount = 0;
            }
        }
    }

    /// @notice Add price to sorted list
    function _addSellPrice(address market, address token, uint256 price) internal {
        if (!_activePrices[market][token][price]) {
            _activePrices[market][token][price] = true;
            _insertSorted(_sellPrices[market][token], price, true);
        }
    }

    function _addBuyPrice(address market, address token, uint256 price) internal {
        if (!_activePrices[market][token][price]) {
            _activePrices[market][token][price] = true;
            _insertSorted(_buyPrices[market][token], price, false);
        }
    }

    function _removePrice(address market, address token, uint256 price, bool isSell) internal {
        if (sellOrderBook[market][token][price].length == 0 && 
            buyOrderBook[market][token][price].length == 0) {
            _activePrices[market][token][price] = false;
            if (isSell) {
                _removeFromArray(_sellPrices[market][token], price);
            } else {
                _removeFromArray(_buyPrices[market][token], price);
            }
        }
    }

    function _insertSorted(uint256[] storage arr, uint256 price, bool ascending) internal {
        uint256 i = 0;
        while (i < arr.length && (ascending ? arr[i] < price : arr[i] > price)) {
            i++;
        }
        arr.push(0);
        for (uint256 j = arr.length - 1; j > i; j--) {
            arr[j] = arr[j - 1];
        }
        arr[i] = price;
    }

    function _removeFromArray(uint256[] storage arr, uint256 price) internal {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == price) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                return;
            }
        }
    }

    /// @notice Get best bid price
    function getBestBid(address market, address token) external view returns (uint256) {
        uint256[] storage prices = _buyPrices[market][token];
        if (prices.length == 0) return 0;
        for (uint256 i = 0; i < prices.length; i++) {
            if (buyOrderBook[market][token][prices[i]].length > 0) {
                return prices[i];
            }
        }
        return 0;
    }

    /// @notice Get best ask price
    function getBestAsk(address market, address token) external view returns (uint256) {
        uint256[] storage prices = _sellPrices[market][token];
        if (prices.length == 0) return 0;
        for (uint256 i = 0; i < prices.length; i++) {
            if (sellOrderBook[market][token][prices[i]].length > 0) {
                return prices[i];
            }
        }
        return 0;
    }

    /// @notice Collect fees
    function collectFees() external onlyOwner {
        uint256 fee = accumulatedFee;
        accumulatedFee = 0;
        collateralToken.safeTransfer(owner(), fee);
    }
}
