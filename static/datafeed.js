// DatafeedConfiguration implementation
const configurationData = {
    // Represents the resolutions for bars supported by your datafeed
    supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
    // The `exchanges` arguments are used for the `searchSymbols` method if a user selects the exchange
    exchanges: [
        { value: 'ZEOSEXCHANGE', name: 'ZEOSEXCHANGE', desc: 'ZEOS Exchange'},
    ],
    // The `symbols_types` arguments are used for the `searchSymbols` method if a user selects this symbol type
    symbols_types: [
        { name: 'crypto', value: 'crypto'}
    ]
};

export default {
    onReady: async (callback) => {
        console.log('[onReady]: Method call');
        mid = 0; // must be the default symbol!
        await fetchReferenceBlockTime();
        await fetchAllSymbols();
        await fetchMarket(mid);
        await fetchTickerList();
        updateUI();
        resetBuyInput();
        resetSellInput();
        resetDepositInput();
        resetWithdrawInput();
        setInterval(async function() {
            // update market/UI and ticker every 3 seconds
            await fetchMarket(mid);
            await fetchTickerList();
            updateUI();
            executeStopOrders();
        }, 3000);
        setTimeout(() => callback(configurationData));
    },

    searchSymbols: async (
        userInput,
        exchange,
        symbolType,
        onResultReadyCallback
    ) => {
        console.log('[searchSymbols]: Method call');
        onResultReadyCallback(symbols);
    },

    setNewSymbol: async (symbolName) => {
        console.log('[setNewSymbol]: Method call', symbolName);
        mid = symbols.findIndex(({ full_name }) => full_name === symbolName);
        if (-1 === mid) {
            console.log('[setNewSymbol]: Cannot resolve symbol', symbolName);
            return;
        }
        await fetchTickerList();
        await fetchMarket(mid);
        await fetchStopOrders();
        await fetchBalances(); // call after fetchMarket
        updateUI();
        resetBuyInput();
        resetSellInput();
        resetDepositInput();
        resetWithdrawInput();
    },

    resolveSymbol: async (
        symbolName,
        onSymbolResolvedCallback,
        onResolveErrorCallback,
        extension
    ) => {
        console.log('[resolveSymbol]: Method call', symbolName);
        let id = symbols.findIndex(({ full_name }) => full_name === symbolName);
        if (-1 === id) {
            console.log('[resolveSymbol]: Cannot resolve symbol', symbolName);
            onResolveErrorCallback('Cannot resolve symbol');
            return;
        }
        await fetchMarket(id);
        const symbolInfo = {
            ticker: symbols[id].full_name,
            name: symbols[id].symbol,
            description: symbols[id].description,
            type: symbols[id].type,
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: symbols[id].exchange,
            minmov: 1,
            pricescale: symbols[id].price_scale,
            visible_plots_set: 'ohlc',
            has_weekly_and_monthly: false,
            has_intraday: true,
            intraday_multipliers: ['1', '60'],
            supported_resolutions: configurationData.supported_resolutions,
            volume_precision: symbols[id].volume_precision,
            data_status: 'streaming',
        };
        console.log('[resolveSymbol]: Symbol resolved', symbolName);
        onSymbolResolvedCallback(symbolInfo);
    },

    getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
        const { from, to, firstDataRequest } = periodParams;
        console.log('[getBars]: Method call', symbolInfo, resolution, from, to);
        let id = symbols.findIndex(({ full_name }) => full_name === symbolInfo.full_name);
        if (-1 === id) {
            console.log('[getBars]: Cannot resolve symbol', symbolInfo.full_name);
            onErrorCallback('Cannot resolve symbol');
            return;
        }
        let m = markets.get(id);
        let i = m.history_blocks.length - 1;
        while(ts2bn(from * 1000) < m.market.history[0].b && i > 0)
        {
            await $.post('/history', { id, num: m.history_blocks[i] }, (data, status, xhr) => {
                // only add old ticks that don't exist in market history yet
                let old_history = data.filter(tick_old => !m.market.history.find(tick_new => tick_old.b === tick_new.b && tick_old.v === tick_new.v && tick_old.p === tick_new.p && tick_old.t === tick_new.t));
                m.market.history = [...old_history, ...m.market.history];
            }, 'json');
            i--;
        }
        markets.set(id, m);
        let bars = ticks2bars(m.market.history, from * 1000, to * 1000, resolution);
        // scale price and volume values for TV chart widget
        bars.map(b => {
            b.open /= Math.pow(10, m.market.price_decimals);
            b.close /= Math.pow(10, m.market.price_decimals);
            b.high /= Math.pow(10, m.market.price_decimals);
            b.low /= Math.pow(10, m.market.price_decimals);
            b.volume /= Math.pow(10, base_precision(m));
        })
        last_bar.set(m.id, bars[bars.length-1]);
        last_block.set(m.id, m.market.history[m.market.history.length-1].b);
        console.log(`[getBars]: returned ${bars.length} bar(s)`);
        onHistoryCallback(bars, { noData: false });
    },

    subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) => {
        console.log('[subscribeBars]: Method call with subscriberUID:', subscriberUID);
        let id = symbols.findIndex(({ full_name }) => full_name === symbolInfo.full_name);
        if (-1 === id) {
            console.log('[subscribeBars]: Cannot resolve symbol', symbolInfo.full_name);
            return;
        }
        var newSub = {
            resolution,
            symbolInfo,
            lastBar: last_bar.get(id),
            lastBlock: last_block.get(id),
            update: onRealtimeCallback,
            reset: onResetCacheNeededCallback
        };
        tv_subs.set(subscriberUID, newSub);
    },

    unsubscribeBars: (subscriberUID) => {
        console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
        tv_subs.delete(subscriberUID);
    },
};
