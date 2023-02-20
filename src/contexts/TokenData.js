import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect } from 'react'
import { BigNumber } from 'ethers/utils'
import { testClient } from '../apollo/client'
import {
  TOKEN_DATA,
  TOKEN_PRICE_BY_DATE,
  GLOBAL_TXNS_BASED,
} from '../apollo/queries'

import { useEthPrice } from './GlobalData'
import { useAllPairData } from "./PairData";

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

import {
  isAddress,
} from '../utils'
import { timeframeOptions } from '../constants'

const UPDATE = 'UPDATE'
const UPDATE_TOKEN_TXNS = 'UPDATE_TOKEN_TXNS'
const UPDATE_CHART_DATA = 'UPDATE_CHART_DATA'
const UPDATE_PRICE_DATA = 'UPDATE_PRICE_DATA'
const UPDATE_TOP_TOKENS = ' UPDATE_TOP_TOKENS'
const UPDATE_ALL_PAIRS = 'UPDATE_ALL_PAIRS'
const UPDATE_COMBINED = 'UPDATE_COMBINED'

const TOKEN_PAIRS_KEY = 'TOKEN_PAIRS_KEY'

dayjs.extend(utc)

const TokenDataContext = createContext()

export function useTokenDataContext() {
  return useContext(TokenDataContext)
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { tokenAddress, data } = payload
      return {
        ...state,
        [tokenAddress]: {
          ...state?.[tokenAddress],
          ...data,
        },
      }
    }
    case UPDATE_TOP_TOKENS: {
      const { topTokens } = payload
      let added = {}
      topTokens &&
        topTokens.map((token) => {
          return (added[token.tokenAddress] = token)
        })
      return {
        ...state,
        ...added,
      }
    }

    case UPDATE_COMBINED: {
      const { combinedVol } = payload
      return {
        ...state,
        combinedVol,
      }
    }

    case UPDATE_TOKEN_TXNS: {
      const { address, transactions } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          txns: transactions,
        },
      }
    }
    case UPDATE_CHART_DATA: {
      const { address, chartData } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          chartData,
        },
      }
    }

    case UPDATE_PRICE_DATA: {
      const { address, data, timeWindow, interval } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          [timeWindow]: {
            ...state?.[address]?.[timeWindow],
            [interval]: data,
          },
        },
      }
    }

    case UPDATE_ALL_PAIRS: {
      const { address, allPairs } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          [TOKEN_PAIRS_KEY]: allPairs,
        },
      }
    }
    default: {
      throw Error(`Unexpected action type in DataContext reducer: '${type}'.`)
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, {})
  const update = useCallback((tokenAddress, data) => {
    dispatch({
      type: UPDATE,
      payload: {
        tokenAddress,
        data,
      },
    })
  }, [])

  const updateTopTokens = useCallback((topTokens) => {
    dispatch({
      type: UPDATE_TOP_TOKENS,
      payload: {
        topTokens,
      },
    })
  }, [])

  const updateCombinedVolume = useCallback((combinedVol) => {
    dispatch({
      type: UPDATE_COMBINED,
      payload: {
        combinedVol,
      },
    })
  }, [])

  const updateTokenTxns = useCallback((address, transactions) => {
    dispatch({
      type: UPDATE_TOKEN_TXNS,
      payload: { address, transactions },
    })
  }, [])

  const updateChartData = useCallback((address, chartData) => {
    dispatch({
      type: UPDATE_CHART_DATA,
      payload: { address, chartData },
    })
  }, [])

  const updateAllPairs = useCallback((address, allPairs) => {
    dispatch({
      type: UPDATE_ALL_PAIRS,
      payload: { address, allPairs },
    })
  }, [])

  const updatePriceData = useCallback((address, data, timeWindow, interval) => {
    dispatch({
      type: UPDATE_PRICE_DATA,
      payload: { address, data, timeWindow, interval },
    })
  }, [])

  return (
    <TokenDataContext.Provider
      value={useMemo(
        () => [
          state,
          {
            update,
            updateTokenTxns,
            updateChartData,
            updateTopTokens,
            updateAllPairs,
            updatePriceData,
            updateCombinedVolume,
          },
        ],
        [
          state,
          update,
          updateTokenTxns,
          updateCombinedVolume,
          updateChartData,
          updateTopTokens,
          updateAllPairs,
          updatePriceData,
        ]
      )}
    >
      {children}
    </TokenDataContext.Provider>
  )
}

const getTopTokens = async (ethPrice, ethPriceOld, allPairsData) => {
  const utcCurrentTime = dayjs()
  const utcOneDayBack = utcCurrentTime.subtract(1, 'day').unix()
  let current = await testClient.query({
    query: TOKEN_DATA,
    variables: {
    },
    fetchPolicy: 'cache-first',
  })

  try {
    let bulkResults = await Promise.all(
      current &&
        current?.data?.tokensMany.map(async (token) => {
          let data = token
          data.id = token.tokenAddress
          let allFound = false;
          let skip = 0;

          const year = 31536000;
          const day = 86400;
          let volumeUsd24 = 0;
          let volumeUsd48 = 0;
          let tokenPairs = []

          //Get Volume by token
          for (const [key, value] of Object.entries(allPairsData)) {
            if( value.token0Address === token.tokenAddress ){
              volumeUsd24 += value.volume0USDPerDay[Object.keys(value.volume0USDPerDay).length - 1].volume;
              volumeUsd48 += value.volume0USDPerDay[Object.keys(value.volume0USDPerDay).length - 2].volume;
              tokenPairs.push(value.pairAddress)
            } else if( value.token1Address === token.tokenAddress ) {
              volumeUsd24 += value.volume1USDPerDay[Object.keys(value.volume1USDPerDay).length - 1].volume;
              volumeUsd48 += value.volume1USDPerDay[Object.keys(value.volume1USDPerDay).length - 2].volume;
              tokenPairs.push(value.pairAddress)
            }
          }
          let dataFinal = [];
          var dataRcv = [];
          var liquidityByDay = [];

          const utcCurrentTime = dayjs().utcOffset(0).startOf("date");
          const utcCurrentTime2 = dayjs().utcOffset(0);
          const utc2DayBack = dayjs().utcOffset(0).unix() - day*2;

          while (!allFound) {
            let result = await testClient.query({
              query: TOKEN_PRICE_BY_DATE,
              variables: {
                tokenAddress: token.tokenAddress,
                startTime: utcCurrentTime.unix() - day * 4,
                endTime: utcCurrentTime2.unix(),
                limit: 1000,
                skip: skip
              },
              fetchPolicy: "cache-first"
            });
            skip += 1000;
            dataRcv = dataRcv.concat(result.data.getTokenPrircesByDate);
            if (result.data.getTokenPrircesByDate.length < 1000) {
              allFound = true;
            }
          }

          let currentTime = 0;
          let totalLiquidityUSD = 0;
          let counter = 0;
          let tokenPriceDayBack = 0;
          let tokenPrice2DayBack = 0;

          let tokenLiqDayBack = 0;

          dataRcv.forEach((tokenPrice, i) => {
            if (i === 0) {
              currentTime = tokenPrice.timeStamp;
            }
            const utcCurrentTime = dayjs.unix(currentTime).utcOffset(0).startOf("date").unix();
            const utcDayTime = dayjs.unix(tokenPrice.timeStamp).utcOffset(0).startOf("date").unix();

            if( tokenPrice.timeStamp > utc2DayBack && tokenPrice2DayBack === 0 )
            {
              tokenPrice2DayBack = tokenPrice.priceInUSD;
              tokenLiqDayBack = tokenPrice.liquidityUSD;
            }

            if( tokenPrice.timeStamp > utcOneDayBack && tokenPriceDayBack === 0 )
            {
              tokenPriceDayBack = tokenPrice.priceInUSD;
            }
      
            if (utcDayTime > utcCurrentTime) {
              dataFinal = {
                id: counter,
                date: utcCurrentTime,
                liquidity: totalLiquidityUSD
              };
              liquidityByDay.push(dataFinal);
              currentTime = tokenPrice.timeStamp;
              totalLiquidityUSD = 0;
              counter += 1;
            }
            totalLiquidityUSD = tokenPrice.liquidityUSD;
          });

          dataFinal = {
            id: counter,
            date: utcCurrentTime.unix(),
            liquidity: totalLiquidityUSD
          };
          liquidityByDay.push(dataFinal);

          tokenPrice2DayBack = tokenPriceDayBack - 0.1

          let currentChange = parseFloat(token.priceUSD) - parseFloat(tokenPriceDayBack)
          let previousChange = parseFloat(token.priceUSD) + parseFloat(tokenPriceDayBack) / 2;
          const adjustedPercentChange = (parseFloat(currentChange / previousChange)) * 100

          let currentChangeVolume = parseFloat(volumeUsd24) - parseFloat(volumeUsd48)
          let previousChangeVolume = parseFloat(volumeUsd24) + parseFloat(volumeUsd48) / 2;
          const adjustedPercentChangeVolume = (parseFloat(currentChangeVolume / previousChangeVolume)) * 100

          let currentChangeLiq= parseFloat(totalLiquidityUSD) - parseFloat(tokenLiqDayBack)
          let previousChangeLiq = parseFloat(totalLiquidityUSD) + parseFloat(tokenLiqDayBack) / 2;
          const adjustedPercentChangeLiq = (parseFloat(currentChangeLiq / previousChangeLiq)) * 100

          data.priceUSD = token.priceUSD;
          data.totalLiquidityUSD = totalLiquidityUSD;
          data.oneDayVolumeUSD = volumeUsd24;
          data.volumeChangeUSD = adjustedPercentChangeVolume;
          data.priceChangeUSD = adjustedPercentChange;
          data.liquidityChangeUSD = adjustedPercentChangeLiq;
          data.oneDayTxns = [];
          data.txnChange = 0;
          data.name = token.symbol;
          return data
        })
   )

    return bulkResults;
  } catch (e) {
    console.log(e)
  }
}

const getTokenData = async (address, ethPrice, ethPriceOld) => {
  return [];
}

const getTokenTransactions = async (tokenAddress, allPairsData) => {
  let transactions = {}
  try {
    let result = await testClient.query({
      query: GLOBAL_TXNS_BASED,
      fetchPolicy: 'cache-first',
        variables: {
        limit: 1000,
        skip: 0
      },
    })
    transactions.mints = []
    transactions.burns = []
    transactions.swaps = []

    result?.data?.transactionMany &&
      result.data.transactionMany.map((transaction) => {
      let pair = allPairsData[transaction.pairAddress];

        if( pair && pair.token1Info ){
          if( pair.token0Address !== tokenAddress && pair.token1Address !== tokenAddress )
            return false;
        
          let amount0In = new BigNumber(transaction.amount0In)
          amount0In = amount0In.div(new BigNumber(10).pow(pair.token0Info.decimals))
    
          let amount1In = new BigNumber(transaction.amount1In)
          amount1In = amount1In.div(new BigNumber(10).pow(pair.token1Info.decimals))
    
          let amount0Out = new BigNumber(transaction.amount0Out)
          amount0Out = amount0Out.div(new BigNumber(10).pow(pair.token0Info.decimals))
    
          let amount1Out = new BigNumber(transaction.amount1Out)
          amount1Out = amount1Out.div(new BigNumber(10).pow(pair.token1Info.decimals))
          
          let tx = {token0Symbol: pair.token0Info.symbol, token1Symbol: pair.token1Info.symbol, amount0In: amount0In, amount0Out: amount0Out,
          amount1In: amount1In, amount1Out: amount1Out, hash: transaction.transactionHash, timeStamp: transaction.timeStamp, amountUSD: transaction.amountUSD, to: transaction.to };
          transactions.swaps.push(tx)
        }
        return true
      })
  } catch (e) {
    console.log(e)
  }
  return transactions
}

const getTokenPairs = async (tokenAddress) => {
  return [];
}

const getIntervalTokenData = async (tokenAddress, startTime, interval = 3600) => {
    const utcEndTime = dayjs.utc()
    let time = startTime

    // create an array of hour start times until we reach current hour
    // buffer by half hour to catch case where graph isnt synced to latest block
    const timestamps = []
    while (time < utcEndTime.unix()) {
      timestamps.push(time)
      time += interval
    }

    // backout if invalid timestamp format
    if (timestamps.length === 0) {
      return []
    }

    // once you have all the timestamps, get the blocks for each timestamp in a bulk query
    let blocks

    try {
      let allFound = false;
      let skip = 0;
      let dataRcv = [];
      const utcCurrentTime = dayjs().utcOffset(0).startOf("date");
      const utcCurrentTime2 = dayjs().utcOffset(0);
      const year = 31536000;

      while (!allFound) {
        let result = await testClient.query({
          query: TOKEN_PRICE_BY_DATE,
          variables: {
            tokenAddress: tokenAddress,
            startTime: utcCurrentTime.unix() - year,
            endTime: utcCurrentTime2.unix(),
            limit: 1000,
            skip: skip
          },
          fetchPolicy: "cache-first"
        });
        skip += 1000;
        dataRcv = dataRcv.concat(result.data.getTokenPrircesByDate);
        if (result.data.getTokenPrircesByDate.length < 1000) {
          allFound = true;
        }
      }

       let formattedHistory = []

      // for each hour, construct the open and close price
      for (let i = 0; i < dataRcv.length - 1; i++) {
        formattedHistory.push({
          timestamp: dataRcv[i].timeStamp,
          open: parseFloat(dataRcv[i].priceInUSD),
          close: parseFloat(dataRcv[i + 1].priceInUSD),
        })
      }

       return formattedHistory
    } catch (e) {
      console.log(e)
      console.log('error fetching blocks')
      return []
    }
 }

 const getTokenChartData = async (tokenAddress, tokensData, allPairsData) => {
   let data = []
   const utcEndTime = dayjs.utc()
   let utcStartTime = utcEndTime.subtract(1, 'year')
   let startTime = utcStartTime.startOf('minute').unix() - 1

   const utcCurrentTime = dayjs().utcOffset(0).startOf("date");
   const utcCurrentTime2 = dayjs().utcOffset(0);
   const year = 31536000;
   let dataRcv = [];
   let allFound = false;
   let skip = 0;
   try {
      while (!allFound) {
        let result = await testClient.query({
          query: TOKEN_PRICE_BY_DATE,
          variables: {
            tokenAddress: tokenAddress,
            startTime: utcCurrentTime.unix() - year,
            endTime: utcCurrentTime2.unix(),
            limit: 1000,
            skip: skip
          },
          fetchPolicy: "cache-first"
        });
        skip += 1000;
        dataRcv = dataRcv.concat(result.data.getTokenPrircesByDate);
        if (result.data.getTokenPrircesByDate.length < 1000) {
          allFound = true;
        }
      }
    
      let priceByDay = [];
      let currentTime = 0;
      let currentTokenPrice = {};

      priceByDay.push({timeStamp: 1676624662 - 86400 * 2, priceInUSD: 0.1})
      priceByDay.push({timeStamp: 1676624662 - 86400, priceInUSD: 0.2})
      priceByDay.push({timeStamp: 1676624662, priceInUSD: 0.2})

      dataRcv.forEach((tokenPrice, i) => {
        if (i === 0) {
          currentTime = tokenPrice.timeStamp;
        }
  
        const utcCurrentTime = dayjs.unix(currentTime).utcOffset(0).startOf("date").unix();
        const utcDayTime = dayjs.unix(tokenPrice.timeStamp).utcOffset(0).startOf("date").unix();

        if (utcDayTime > utcCurrentTime) {
          data.push({
            date: currentTokenPrice.timeStamp,
            dayString: currentTokenPrice.timeStamp,
            dailyVolumeUSD: 0,
            priceUSD: currentTokenPrice.priceInUSD,
            totalLiquidityUSD: 0,
            mostLiquidPairs: 0,
          })
          priceByDay.push(currentTokenPrice);
          currentTime = tokenPrice.timeStamp;
        }
        currentTokenPrice = tokenPrice;
      })
      priceByDay.push(currentTokenPrice);
      data.push({
        date: currentTokenPrice.timeStamp,
        dayString: currentTokenPrice.timeStamp,
        dailyVolumeUSD: 0,
        priceUSD: currentTokenPrice.priceInUSD,
        totalLiquidityUSD: 0,
        mostLiquidPairs: 0,
      })

      let dayIndexSet = new Set()
      let dayIndexArray = []
      const oneDay = 24 * 60 * 60
      priceByDay.forEach((dayData, i) => {
        dayIndexSet.add((priceByDay[i].timeStamp / oneDay).toFixed(0))
        dayIndexArray.push(priceByDay[i])
      })
   }
   catch(e){
      console.log(e)
   }
  return data
}

export function Updater() {
  const [, { updateTopTokens }] = useTokenDataContext()
  const [ethPrice, ethPriceOld] = useEthPrice()
  const allPairsData = useAllPairData();

  useEffect(() => {
    async function getData() {
      // get top pairs for overview list
      let topTokens = await getTopTokens(ethPrice, ethPriceOld, allPairsData)
      topTokens && updateTopTokens(topTokens)
    }
    ethPrice && ethPriceOld && Object.keys(allPairsData).length > 0 && getData()
  }, [ethPrice, ethPriceOld, updateTopTokens, allPairsData])
  return null
}

export function useTokenData(tokenAddress) {
  const [state, { update }] = useTokenDataContext()
  const [ethPrice, ethPriceOld] = useEthPrice()
  const tokenData = state?.[tokenAddress]

  useEffect(() => {
    if (!tokenData && ethPrice && ethPriceOld && isAddress(tokenAddress)) {
      getTokenData(tokenAddress, ethPrice, ethPriceOld).then((data) => {
        update(tokenAddress, data)
      })
    }
  }, [ethPrice, ethPriceOld, tokenAddress, tokenData, update])

  return tokenData || {}
}

export function useTokenTransactions(tokenAddress) {
  const [state, { updateTokenTxns }] = useTokenDataContext()
  const tokenTxns = state?.[tokenAddress]?.txns
  const allPairsData = useAllPairData();

  useEffect(() => {
    async function checkForTxns() {
      if (!tokenTxns && Object.keys(allPairsData).length > 0) {
        let transactions = await getTokenTransactions(tokenAddress, allPairsData)
        updateTokenTxns(tokenAddress, transactions)
      }
    }
    checkForTxns()
  }, [tokenTxns, tokenAddress, updateTokenTxns, allPairsData])

  return tokenTxns || []
}

export function useTokenPairs(tokenAddress) {
  const [state, { updateAllPairs }] = useTokenDataContext()
  const tokenPairs = state?.[tokenAddress]?.[TOKEN_PAIRS_KEY]

  useEffect(() => {
    async function fetchData() {
      let allPairs = await getTokenPairs(tokenAddress)
      updateAllPairs(tokenAddress, allPairs)
    }
    if (!tokenPairs && isAddress(tokenAddress)) {
      fetchData()
    }
  }, [tokenAddress, tokenPairs, updateAllPairs])

  return tokenPairs || []
}

export function useTokenDataCombined(tokenAddresses) {
  const [state, { updateCombinedVolume }] = useTokenDataContext()
  const [ethPrice, ethPriceOld] = useEthPrice()

  const volume = state?.combinedVol

  useEffect(() => {
    async function fetchDatas() {
      Promise.all(
        tokenAddresses.map(async (address) => {
          return await getTokenData(address, ethPrice, ethPriceOld)
        })
      )
        .then((res) => {
          if (res) {
            const newVolume = res
              ? res?.reduce(function (acc, entry) {
                  acc = acc + parseFloat(entry.oneDayVolumeUSD)
                  return acc
                }, 0)
              : 0
            updateCombinedVolume(newVolume)
          }
        })
        .catch(() => {
          console.log('error fetching combined data')
        })
    }
    if (!volume && ethPrice && ethPriceOld) {
      fetchDatas()
    }
  }, [tokenAddresses, ethPrice, ethPriceOld, volume, updateCombinedVolume])

  return volume
}

export function useTokenChartDataCombined(tokenAddresses) {
  return []
}

export function useTokenChartData(tokenAddress) {
  const [state, { updateChartData }] = useTokenDataContext()
  const allPairsData = useAllPairData();

  const chartData = state?.[tokenAddress]?.chartData
  useEffect(() => {
    async function checkForChartData() {
      if (!chartData) {
        let data = await getTokenChartData(tokenAddress, state, allPairsData)
        updateChartData(tokenAddress, data)
      }
    }
    if( Object.keys(allPairsData).length > 0 )
      checkForChartData()
  }, [chartData, tokenAddress, updateChartData, allPairsData])
  return chartData
}

/**
 * get candlestick data for a token - saves in context based on the window and the
 * interval size
 * @param {*} tokenAddress
 * @param {*} timeWindow // a preset time window from constant - how far back to look
 * @param {*} interval  // the chunk size in seconds - default is 1 hour of 3600s
 */
export function useTokenPriceData(tokenAddress, timeWindow, interval = 3600) {
  const [state, { updatePriceData }] = useTokenDataContext()
  const chartData = state?.[tokenAddress]?.[timeWindow]?.[interval]
  // const [latestBlock] = useLatestBlocks()

  useEffect(() => {
    const currentTime = dayjs.utc()
    const windowSize = timeWindow === timeframeOptions.MONTH ? 'month' : 'week'
    const startTime =
      timeWindow === timeframeOptions.ALL_TIME ? 1589760000 : currentTime.subtract(1, windowSize).startOf('hour').unix()

    async function fetch() {
      let data = await getIntervalTokenData(tokenAddress, startTime, interval)
      updatePriceData(tokenAddress, data, timeWindow, interval)
    }
    if (!chartData) {
      fetch()
    }
  }, [chartData, interval, timeWindow, tokenAddress, updatePriceData])

  return chartData
}

export function useAllTokenData() {
  const [state] = useTokenDataContext()

  // filter out for only addresses
  return Object.keys(state)
    .filter((key) => key !== 'combinedVol')
    .reduce((res, key) => {
      res[key] = state[key]
      return res
    }, {})
}
