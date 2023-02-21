import React, {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  useEffect,
  useState
} from "react";
import {  testClient } from "../apollo/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { BigNumber } from "ethers/utils";

import { useTimeframe } from "./Application";
import {
  getTimeframe
} from "../utils";
import {
  GLOBAL_TXNS_BASED,
  VOLUMES_DATA_BY_DATE
} from "../apollo/queries";
import weekOfYear from "dayjs/plugin/weekOfYear";
import { useAllPairData } from "./PairData";
import { useTokenChartDataCombined } from "./TokenData";
import { ethers } from "ethers";

const UPDATE = "UPDATE";
const UPDATE_TXNS = "UPDATE_TXNS";
const UPDATE_CHART = "UPDATE_CHART";
const UPDATE_ETH_PRICE = "UPDATE_ETH_PRICE";
const ETH_PRICE_KEY = "ETH_PRICE_KEY";
const UPDATE_ALL_PAIRS_IN_UNISWAP = "UPDAUPDATE_ALL_PAIRS_IN_UNISWAPTE_TOP_PAIRS";
const UPDATE_ALL_TOKENS_IN_UNISWAP = "UPDATE_ALL_TOKENS_IN_UNISWAP";
const UPDATE_TOP_LPS = "UPDATE_TOP_LPS";

const offsetVolumes = [
  "0x9ea3b5b4ec044b70375236a281986106457b20ef",
  "0x05934eba98486693aaec2d00b0e9ce918e37dc3f",
  "0x3d7e683fc9c86b4d653c9e47ca12517440fad14e",
  "0xfae9c647ad7d89e738aba720acf09af93dc535f7",
  "0x7296368fe9bcb25d3ecc19af13655b907818cc09"
];

// format dayjs with the libraries that we need
dayjs.extend(utc);
dayjs.extend(weekOfYear);

const GlobalDataContext = createContext();


function useGlobalDataContext() {
  return useContext(GlobalDataContext);
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { data } = payload;
      return {
        ...state,
        globalData: data
      };
    }
    case UPDATE_TXNS: {
      const { transactions } = payload;
      return {
        ...state,
        transactions
      };
    }
    case UPDATE_CHART: {
      const { daily, weekly } = payload;
      return {
        ...state,
        chartData: {
          daily,
          weekly
        }
      };
    }
    case UPDATE_ETH_PRICE: {
      const { ethPrice, oneDayPrice, ethPriceChange } = payload;
      return {
        [ETH_PRICE_KEY]: ethPrice,
        oneDayPrice,
        ethPriceChange
      };
    }

    case UPDATE_ALL_PAIRS_IN_UNISWAP: {
      const { allPairs } = payload;
      return {
        ...state,
        allPairs
      };
    }

    case UPDATE_ALL_TOKENS_IN_UNISWAP: {
      const { allTokens } = payload;
      return {
        ...state,
        allTokens
      };
    }

    case UPDATE_TOP_LPS: {
      const { topLps } = payload;
      return {
        ...state,
        topLps
      };
    }
    default: {
      throw Error(`Unexpected action type in DataContext reducer: '${type}'.`);
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, {});
  const update = useCallback((data) => {
    dispatch({
      type: UPDATE,
      payload: {
        data
      }
    });
  }, []);

  const updateTransactions = useCallback((transactions) => {
    dispatch({
      type: UPDATE_TXNS,
      payload: {
        transactions
      }
    });
  }, []);

  const updateChart = useCallback((daily, weekly) => {
    dispatch({
      type: UPDATE_CHART,
      payload: {
        daily,
        weekly
      }
    });
  }, []);

  const updateEthPrice = useCallback((ethPrice, oneDayPrice, ethPriceChange) => {
    dispatch({
      type: UPDATE_ETH_PRICE,
      payload: {
        ethPrice,
        oneDayPrice,
        ethPriceChange
      }
    });
  }, []);

  const updateAllPairsInUniswap = useCallback((allPairs) => {
    dispatch({
      type: UPDATE_ALL_PAIRS_IN_UNISWAP,
      payload: {
        allPairs
      }
    });
  }, []);

  const updateAllTokensInUniswap = useCallback((allTokens) => {
    dispatch({
      type: UPDATE_ALL_TOKENS_IN_UNISWAP,
      payload: {
        allTokens
      }
    });
  }, []);

  const updateTopLps = useCallback((topLps) => {
    dispatch({
      type: UPDATE_TOP_LPS,
      payload: {
        topLps
      }
    });
  }, []);
  return (
    <GlobalDataContext.Provider
      value={useMemo(
        () => [
          state,
          {
            update,
            updateTransactions,
            updateChart,
            updateEthPrice,
            updateTopLps,
            updateAllPairsInUniswap,
            updateAllTokensInUniswap
          }
        ],
        [
          state,
          update,
          updateTransactions,
          updateTopLps,
          updateChart,
          updateEthPrice,
          updateAllPairsInUniswap,
          updateAllTokensInUniswap
        ]
      )}
    >
      {children}
    </GlobalDataContext.Provider>
  );
}

/**
 * Gets all the global data for the overview page.
 * Needs current eth price and the old eth price to get
 * 24 hour USD changes.
 * @param {*} ethPrice
 * @param {*} oldEthPrice
 */

async function getGlobalData(ethPrice, oldEthPrice, allPairsData) {
  // data for each day , historic data used for % changes
  let data = {};

  try {
    // get timestamps for the days
    const utcCurrentTime = dayjs().utcOffset(0);
    const utcOneWeekBack = utcCurrentTime.subtract(1, "week").unix();

    data = {
      oneDayVolumeUSD: 0,
      oneWeekVolume: 0,
      totalLiquidityUSD: 0,
      weeklyVolumeChange: 0,
      volumeChangeUSD: 0,
      liquidityChangeUSD: 0,
      oneDayTxns: [],
      txnChange: 0
    };

    let totalVolumeUSDData = await testClient.query({
      query: VOLUMES_DATA_BY_DATE,
      variables: {
        startTime: utcCurrentTime.unix() - 86400,
        endTime: utcCurrentTime.unix(),
        limit: 1000,
        skip: 0
      },
      fetchPolicy: "cache-first"
    });

    let liquidityByPair = new Map();
    let dayLiquidity = 0;
    totalVolumeUSDData.data.getDaysVolumeByDate.forEach((day, i) => {
      data.oneDayVolumeUSD += day.volume0USD;
      if (day.liquidityUSD > 0)
        liquidityByPair.set(day.pairAddress, day.liquidityUSD);
    });

    liquidityByPair.forEach((liquid, i) => {
      dayLiquidity += liquid;
    });

    data.totalLiquidityUSD = dayLiquidity;

    let totalVolumeUSDWeekData = await testClient.query({
      query: VOLUMES_DATA_BY_DATE,
      variables: {
        startTime: utcOneWeekBack,
        endTime: utcCurrentTime.unix(),
        limit: 1000,
        skip: 0
      },
      fetchPolicy: "cache-first"
    });

    totalVolumeUSDWeekData.data.getDaysVolumeByDate.forEach((day, i) => {
      data.oneWeekVolume += day.volume0USD;
      //data.totalLiquidityUSD+=day.liquidityUSD
    });

    // let [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
    //   data.totalVolumeUSD,
    //   oneDayData.totalVolumeUSD,
    //   twoDayData.totalVolumeUSD
    // )

    // fetch the global data
    // let result = await client.query({
    //   query: GLOBAL_DATA(),
    //   fetchPolicy: 'cache-first',
    // })
    // data = result.data.uniswapFactories[0]

    // // fetch the historical data
    // let oneDayResult = await client.query({
    //   query: GLOBAL_DATA(oneDayBlock?.number),
    //   fetchPolicy: 'cache-first',
    // })
    // oneDayData = oneDayResult.data.uniswapFactories[0]

    // let twoDayResult = await client.query({
    //   query: GLOBAL_DATA(twoDayBlock?.number),
    //   fetchPolicy: 'cache-first',
    // })
    // twoDayData = twoDayResult.data.uniswapFactories[0]

    // let oneWeekResult = await client.query({
    //   query: GLOBAL_DATA(oneWeekBlock?.number),
    //   fetchPolicy: 'cache-first',
    // })
    // const oneWeekData = oneWeekResult.data.uniswapFactories[0]

    // let twoWeekResult = await client.query({
    //   query: GLOBAL_DATA(twoWeekBlock?.number),
    //   fetchPolicy: 'cache-first',
    // })
    // const twoWeekData = twoWeekResult.data.uniswapFactories[0]

    // if (data && oneDayData && twoDayData && twoWeekData) {
    //   let [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
    //     data.totalVolumeUSD,
    //     oneDayData.totalVolumeUSD,
    //     twoDayData.totalVolumeUSD
    //   )

    //   const [oneWeekVolume, weeklyVolumeChange] = get2DayPercentChange(
    //     data.totalVolumeUSD,
    //     oneWeekData.totalVolumeUSD,
    //     twoWeekData.totalVolumeUSD
    //   )

    //   const [oneDayTxns, txnChange] = get2DayPercentChange(
    //     data.txCount,
    //     oneDayData.txCount ? oneDayData.txCount : 0,
    //     twoDayData.txCount ? twoDayData.txCount : 0
    //   )

    //   // format the total liquidity in USD
    //   data.totalLiquidityUSD = data.totalLiquidityETH * ethPrice
    //   const liquidityChangeUSD = getPercentChange(
    //     data.totalLiquidityETH * ethPrice,
    //     oneDayData.totalLiquidityETH * oldEthPrice
    //   )

    //   // add relevant fields with the calculated amounts
    //   data.oneDayVolumeUSD = oneDayVolumeUSD
    //   data.oneWeekVolume = oneWeekVolume
    //   data.weeklyVolumeChange = weeklyVolumeChange
    //   data.volumeChangeUSD = volumeChangeUSD
    //   data.liquidityChangeUSD = liquidityChangeUSD
    //   data.oneDayTxns = oneDayTxns
    //   data.txnChange = txnChange
    //}
  } catch (e) {
    console.log(e);
  }

  return data;
}

/**
 * Get historical data for volume and liquidity used in global charts
 * on main page
 * @param {*} oldestDateToFetch // start of window to fetch from
 */

let checked = false;


const getChartData = async (oldestDateToFetch, offsetData, allPairsData) => {
  var data = [];
  let weeklyData = [];
  let skip = 0;
  let allFound = false;

  const year = 31536000;

  let dataFinal = [];

  const utcCurrentTime = dayjs().utcOffset(0).startOf("date");
  const utcCurrentTime2 = dayjs().utcOffset(0);

  var dataRcv = [];
  var dataPerDay = [];

  try {
    while (!allFound) {
      let result = await testClient.query({
        query: VOLUMES_DATA_BY_DATE,
        variables: {
          startTime: utcCurrentTime.unix() - year,
          endTime: utcCurrentTime2.unix(),
          limit: 1000,
          skip: skip
        },
        fetchPolicy: "cache-first"
      });
      skip += 1000;
      dataRcv = dataRcv.concat(result.data.getDaysVolumeByDate);
      if (result.data.getDaysVolumeByDate.length < 1000) {
        allFound = true;
      }
    }

    let currentTime = 0;
    let volumePerDay = 0;
    let totalLiquidity = 0;
    let counter = 0;
    let liquidityByPair = new Map();

    dataRcv.forEach((dayData, i) => {
      if (i === 0) {
        currentTime = dayData.timeStamp;
      }

      const utcCurrentTime = dayjs.unix(currentTime).utcOffset(0).startOf("date").unix();
      const utcDayTime = dayjs.unix(dayData.timeStamp).utcOffset(0).startOf("date").unix();

      if (utcDayTime > utcCurrentTime) {
        let dayLiquidity = 0;
        liquidityByPair.forEach((liquid, i) => {
          dayLiquidity += liquid;
        });
        dataFinal = {
          id: counter,
          date: utcCurrentTime,
          totalVolumeUSD: 0,
          dailyVolumeUSD: parseFloat(volumePerDay),
          dailyVolumeETH: 0,
          totalLiquidityUSD: parseFloat(dayLiquidity),
          totalLiquidityETH: 0
        };
        dataPerDay.push(dataFinal);
        currentTime = dayData.timeStamp;
        volumePerDay = 0;
        totalLiquidity = 0;
        counter += 1;
        liquidityByPair.clear();
      }

      if (dayData.liquidityUSD > 0){
        liquidityByPair.set(dayData.pairAddress, dayData.liquidityUSD);
      }
      volumePerDay += dayData.volume0USD;
    });
    //Push last day
    let dayLiquidity = 0;
    liquidityByPair.forEach((liquid, i) => {
      dayLiquidity += liquid;
    });

    dataFinal = {
      id: counter,
      date: currentTime,
      totalVolumeUSD: 0,
      dailyVolumeUSD: parseFloat(volumePerDay),
      dailyVolumeETH: 0,
      totalLiquidityUSD: dayLiquidity,
      totalLiquidityETH: 0
    };
    dataPerDay.push(dataFinal);

    // console.log( " Cur time " + currentTime + " :"  + dayjs.unix(currentTime).utcOffset(0).startOf('date').format("DD/MM/YYYY") + " Day volume " + volumePerDay + " Day luquidity " + dayLiquidity)

    if (dataRcv) {
      let dayIndexSet = new Set();
      let dayIndexArray = [];
      const oneDay = 24 * 60 * 60;

      // for each day, parse the daily volume and format for chart array
      dataPerDay.forEach((dayData, i) => {
        // add the day index to the set of days
        dayIndexSet.add((dataPerDay[i].timeStamp / oneDay).toFixed(0));
        dayIndexArray.push(dayData);
        data.push(dayData);
      });
    }


    // format weekly data for weekly sized chunks
    data = data.sort((a, b) => (parseInt(a.date) > parseInt(b.date) ? 1 : -1));
    let startIndexWeekly = -1;
    let currentWeek = -1;

    data.forEach((entry, i) => {
      const date = data[i].date;

      // hardcoded fix for offset volume
      offsetData &&
      !checked &&
      offsetData.map((dayData) => {
        if (dayData[date]) {
          data[i].dailyVolumeUSD = parseFloat(data[i].dailyVolumeUSD) - parseFloat(dayData[date].dailyVolumeUSD);
        }
        return true;
      });

      const week = dayjs.utc(dayjs.unix(data[i].date)).week();
      if (week !== currentWeek) {
        currentWeek = week;
        startIndexWeekly++;
      }
      weeklyData[startIndexWeekly] = weeklyData[startIndexWeekly] || {};
      weeklyData[startIndexWeekly].date = data[i].date;
      weeklyData[startIndexWeekly].weeklyVolumeUSD =
        (weeklyData[startIndexWeekly].weeklyVolumeUSD ?? 0) + data[i].dailyVolumeUSD;
    });

    if (!checked) {
      checked = true;
    }
  } catch (e) {
    console.log(e);
  }

  
  return [data, weeklyData];
};

/**
 * Get and format transactions for global page
 */
const getGlobalTransactions = async (allPairsData) => {
  let transactions = {};
  try {
    let result = await testClient.query({
      query: GLOBAL_TXNS_BASED,
      fetchPolicy: "cache-first",
      variables: {
        limit: 200,
        skip: 0
      }
    });
    transactions.mints = [];
    transactions.burns = [];
    transactions.swaps = [];

    let lastTransactionHash = '';

    result?.data?.transactionMany &&
    result.data.transactionMany.map((transaction) => {
      let pair = allPairsData[transaction.pairAddress];

      if (pair && pair.token1Info) {
        let amount0InBn = new BigNumber(transaction.amount0In);
        let amount0In = ethers.utils.formatUnits(amount0InBn,pair.token0Info.decimals);

        let amount1InBn = new BigNumber(transaction.amount1In);
        let amount1In = ethers.utils.formatUnits(amount1InBn,pair.token1Info.decimals);

        let amount0OutBn = new BigNumber(transaction.amount0Out);
        let amount0Out = ethers.utils.formatUnits(amount0OutBn,pair.token0Info.decimals);

        let amount1OutBn = new BigNumber(transaction.amount1Out);
        let amount1Out = ethers.utils.formatUnits(amount1OutBn,pair.token1Info.decimals);
        if(transaction.transactionHash == '0x7f0d58b6f67ed2cd0dfcda4c4bf8f32d9055b15b2d4ed817fa7a2f01e1d5ee33') {
          let stop = 1
        }
        if( lastTransactionHash != transaction.transactionHash )
        {
          let tx = {
            token0Symbol: pair.token0Info.symbol,
            token1Symbol: pair.token1Info.symbol,
            amount0In: amount0In,
            amount0Out: amount0Out,
            amount1In: amount1In,
            amount1Out: amount1Out,
            hash: transaction.transactionHash,
            timeStamp: transaction.timeStamp,
            amountUSD: transaction.amountUSD,
            to: transaction.to
          };
          transactions.swaps.push(tx);

        }

        lastTransactionHash = transaction.transactionHash;

      }
      return true;
    });
  } catch (e) {
    console.log(e);
  }
  return transactions;
};

/**
 * Gets the current price  of ETH, 24 hour price, and % change between them
 */
const getEthPrice = async () => {
  // const utcCurrentTime = dayjs();
  // const utcOneDayBack = utcCurrentTime.subtract(1, "day").startOf("minute").unix();

  let ethPrice = 0;
  let ethPriceOneDay = 0;
  let priceChangeETH = 0;

  // try {
  //   let oneDayBlock = await getBlockFromTimestamp(utcOneDayBack);
  //   let result = await client.query({
  //     query: ETH_PRICE(),
  //     fetchPolicy: "cache-first"
  //   });
  //   let resultOneDay = await client.query({
  //     query: ETH_PRICE(oneDayBlock),
  //     fetchPolicy: "cache-first"
  //   });
  //   const currentPrice = result?.data?.bundles[0]?.ethPrice;
  //   const oneDayBackPrice = resultOneDay?.data?.bundles[0]?.ethPrice;
  //   priceChangeETH = 0//getPercentChange(currentPrice, oneDayBackPrice);
  //   ethPrice = 0//currentPrice;
  //   ethPriceOneDay = 0//oneDayBackPrice;
  // } catch (e) {
  //   console.log(e);
  // }

  return [ethPrice, ethPriceOneDay, priceChangeETH];
};

/**
 * Hook that fetches overview data, plus all tokens and pairs for search
 */
export function useGlobalData() {
  const [state, {
    update,
    updateAllPairsInUniswap,
    updateAllTokensInUniswap
  }] = useGlobalDataContext();
  const [ethPrice, oldEthPrice] = useEthPrice();

  const data = state?.globalData;
  const allPairsData = useAllPairData();

  //const combinedVolume = useTokenDataCombined(offsetVolumes)

  useEffect(() => {

    async function fetchData() {

      let globalData = await getGlobalData(ethPrice, oldEthPrice, allPairsData);

      globalData && update(globalData);
    }

    if (!data && ethPrice && oldEthPrice && Object.keys(allPairsData).length > 0) {
      fetchData();
    }
  }, [ethPrice, allPairsData, oldEthPrice, update, data, updateAllPairsInUniswap, updateAllTokensInUniswap]);

  return data || {};
}


export function useGlobalChartData() {
  const [state, { updateChart }] = useGlobalDataContext();
  const [oldestDateFetch, setOldestDateFetched] = useState();
  const [activeWindow] = useTimeframe();

  const chartDataDaily = state?.chartData?.daily;
  const chartDataWeekly = state?.chartData?.weekly;

  /**
   * Keep track of oldest date fetched. Used to
   * limit data fetched until its actually needed.
   * (dont fetch year long stuff unless year option selected)
   */
  useEffect(() => {
    // based on window, get starttime
    let startTime = getTimeframe(activeWindow);

    if ((activeWindow && startTime < oldestDateFetch) || !oldestDateFetch) {
      setOldestDateFetched(startTime);
    }
  }, [activeWindow, oldestDateFetch]);

  // fix for rebass tokens

  const combinedData = useTokenChartDataCombined(offsetVolumes);
  const allPairsData = useAllPairData();

  /**
   * Fetch data if none fetched or older data is needed
   */
  useEffect(() => {
    async function fetchData() {
      // historical stuff for chart
      let [newChartData, newWeeklyData] = await getChartData(oldestDateFetch, combinedData, allPairsData);
      updateChart(newChartData, newWeeklyData);
    }

    if (oldestDateFetch && !(chartDataDaily && chartDataWeekly) && combinedData && Object.keys(allPairsData).length > 0) {
      fetchData();
    }
  }, [chartDataDaily, chartDataWeekly, combinedData, oldestDateFetch, updateChart, allPairsData]);

  return [chartDataDaily, chartDataWeekly];
}

export function useGlobalTransactions() {
  const [state, { updateTransactions }] = useGlobalDataContext();
  const transactions = state?.transactions;
  const allPairsData = useAllPairData();

  useEffect(() => {
    async function fetchData() {
      if (!transactions && Object.keys(allPairsData).length > 0) {
        let txns = await getGlobalTransactions(allPairsData);
        updateTransactions(txns);
      }
    }

    fetchData();
  }, [updateTransactions, transactions, allPairsData]);
  return transactions;
}

export function useEthPrice() {
  const [state, { updateEthPrice }] = useGlobalDataContext();
  const ethPrice = 1//state?.[ETH_PRICE_KEY];
  const ethPriceOld = 1//state?.["oneDayPrice"];
  // useEffect(() => {
  //   async function checkForEthPrice() {
  //     if (!ethPrice) {
  //       let [newPrice, oneDayPrice, priceChange] = await getEthPrice();
  //       updateEthPrice(newPrice, oneDayPrice, priceChange);
  //     }
  //   }

  //   checkForEthPrice();
  // }, [ethPrice, updateEthPrice]);

  return [ethPrice, ethPriceOld];
}

export function useAllPairsInUniswap() {
  const [state] = useGlobalDataContext();
  let allPairs = state?.allPairs;

  return allPairs || [];
}

export function useAllTokensInUniswap() {
  const [state] = useGlobalDataContext();
  let allTokens = state?.allTokens;

  return allTokens || [];
}

/**
 * Get the top liquidity positions based on USD size
 * @TODO Not a perfect lookup needs improvement
 */
export function useTopLps() {
 return [];
}
