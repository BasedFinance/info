import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect, useState } from 'react'

import { testClient } from '../apollo/client'
import {
  PAIR_DATA,
  GLOBAL_TXNS_BASED_BY_PAIR,
  PAIR_VOLUMES_DATA_BY_DATE,
  PAIRS_CURRENT,
  TOKEN_DATA,

} from '../apollo/queries'
import { BigNumber } from 'ethers/utils'
import { useEthPrice } from './GlobalData'

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'


const UPDATE = 'UPDATE'
const UPDATE_PAIR_TXNS = 'UPDATE_PAIR_TXNS'
const UPDATE_CHART_DATA = 'UPDATE_CHART_DATA'
const UPDATE_TOP_PAIRS = 'UPDATE_TOP_PAIRS'
const UPDATE_HOURLY_DATA = 'UPDATE_HOURLY_DATA'

dayjs.extend(utc)

export function safeAccess(object, path) {
  return object
    ? path.reduce(
        (accumulator, currentValue) => (accumulator && accumulator[currentValue] ? accumulator[currentValue] : null),
        object
      )
    : null
}

const PairDataContext = createContext()

function usePairDataContext() {
  return useContext(PairDataContext)
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { pairAddress, data } = payload
      return {
        ...state,
        [pairAddress]: {
          ...state?.[pairAddress],
          ...data,
        },
      }
    }

    case UPDATE_TOP_PAIRS: {
      const { topPairs } = payload
      let added = {}
      topPairs.map((pair) => {
        return (added[pair.pairAddress] = pair)
      })
      return {
        ...state,
        ...added,
      }
    }

    case UPDATE_PAIR_TXNS: {
      const { address, transactions } = payload
      return {
        ...state,
        [address]: {
          ...(safeAccess(state, [address]) || {}),
          txns: transactions,
        },
      }
    }
    case UPDATE_CHART_DATA: {
      const { address, chartData } = payload
      return {
        ...state,
        [address]: {
          ...(safeAccess(state, [address]) || {}),
          chartData,
        },
      }
    }

    case UPDATE_HOURLY_DATA: {
      const { address, hourlyData, timeWindow } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          hourlyData: {
            ...state?.[address]?.hourlyData,
            [timeWindow]: hourlyData,
          },
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

  // update pair specific data
  const update = useCallback((pairAddress, data) => {
    dispatch({
      type: UPDATE,
      payload: {
        pairAddress,
        data,
      },
    })
  }, [])

  const updateTopPairs = useCallback((topPairs) => {
    dispatch({
      type: UPDATE_TOP_PAIRS,
      payload: {
        topPairs,
      },
    })
  }, [])

  const updatePairTxns = useCallback((address, transactions) => {
    dispatch({
      type: UPDATE_PAIR_TXNS,
      payload: { address, transactions },
    })
  }, [])

  const updateChartData = useCallback((address, chartData) => {
    dispatch({
      type: UPDATE_CHART_DATA,
      payload: { address, chartData },
    })
  }, [])

  const updateHourlyData = useCallback((address, hourlyData, timeWindow) => {
    dispatch({
      type: UPDATE_HOURLY_DATA,
      payload: { address, hourlyData, timeWindow },
    })
  }, [])

  return (
    <PairDataContext.Provider
      value={useMemo(
        () => [
          state,
          {
            update,
            updatePairTxns,
            updateChartData,
            updateTopPairs,
            updateHourlyData,
          },
        ],
        [state, update, updatePairTxns, updateChartData, updateTopPairs, updateHourlyData]
      )}
    >
      {children}
    </PairDataContext.Provider>
  )
}

async function getPairData(pairList, ethPrice) {

  try {
    let tokens = await testClient.query({
      query: TOKEN_DATA,
      variables: {
      },
      fetchPolicy: 'cache-first',
    })

    let pairsData = await Promise.all(
      pairList.map(async (pair) => {
        let result = await testClient.query({
          query: PAIR_DATA,
          variables: {
            pairAddress: pair.pairAddress,
            skip: 0,
            limit: 1000
          },
          fetchPolicy: 'cache-first',
        })

        let volume0USDTotal = 0;
        let volume0USDPerDay = [];
        let volume1USDTotal = 0;
        let volume1USDPerDay = [];
        let token0Address = "";
        let token1Address = "";
        let pairTotalLiquidity = 0;
        let liquidityUSDPerDay = [];
        let pairAddress = "";

        let currentTime = 0;

        let currentVolumeUSD0 = 0;
        let currentVolumeUSD1 = 0;
        let currentLiquidityUSD = 0;
        let liquidityByPair = new Map();
        let volume =  0;
        let volume48 = 0;
        let volumeWeek =  0;

        let currentTimeStamp = dayjs().utcOffset(0);
        let oneDayBack = currentTimeStamp.unix() - 86400;
        let twoDayBack = currentTimeStamp.unix() - 86400 * 2;
        let oneWeekBack = currentTimeStamp.unix() - 86400*7;


        result.data.getDaysVolume.forEach((day, i) => {
          if( i === 0 ){
            token0Address = day.token0address;
            token1Address = day.token1address;
            pairAddress = day.pairAddress;
            currentTime = day.timeStamp;
          }
          const utcCurrentTime = dayjs.unix(currentTime).utcOffset(0).startOf('date').unix();
          const utcDayTime = dayjs.unix(day.timeStamp).utcOffset(0).startOf('date').unix();
          
          if( day.timeStamp >= twoDayBack && day.timeStamp < oneDayBack ) {
            volume48+=day.volume0USD;
          }

          if( day.timeStamp >= oneDayBack ){
            volume+= day.volume0USD;
          }
          if( day.timeStamp >= oneWeekBack ){
            volumeWeek+= day.volume0USD;
          }

          if( utcDayTime > utcCurrentTime ){
            let dayLiquidity = 0;

            liquidityByPair.forEach((liquid, i) => {
              dayLiquidity+=liquid;
            });
            liquidityUSDPerDay.push({liquidity: dayLiquidity, timeStamp: utcCurrentTime});
            volume0USDPerDay.push({volume: currentVolumeUSD0, timeStamp: utcCurrentTime})
            volume1USDPerDay.push({volume: currentVolumeUSD1, timeStamp: utcCurrentTime})
            currentVolumeUSD0=0;
            currentVolumeUSD1=0;
            currentLiquidityUSD=0;
            currentTime = day.timeStamp;
            liquidityByPair.clear();
          }
          currentVolumeUSD0+=day.volume0USD;
          currentVolumeUSD1+=day.volume1USD;
          currentLiquidityUSD+=day.liquidityUSD;
          volume0USDTotal+=day.volume0USD;
          volume1USDTotal+=day.volume1USD;
          if( day.liquidityUSD > 0 )
            liquidityByPair.set(day.pairAddress, day.liquidityUSD);
        })

        let dayLiquidity = 0;

        liquidityByPair.forEach((liquid, i) => {
          dayLiquidity+=liquid;
        });
        liquidityUSDPerDay.push({liquidity: dayLiquidity, timeStamp: currentTime});
        volume0USDPerDay.push({volume: currentVolumeUSD0, timeStamp: currentTime})
        volume1USDPerDay.push({volume: currentVolumeUSD1, timeStamp: currentTime})

        let token0Info = tokens.data.tokensMany.find(emp => emp.tokenAddress === token0Address)
        let token1Info = tokens.data.tokensMany.find(emp => emp.tokenAddress === token1Address)
    
        let reserve0 = pair.reserve0;
        let reserve1 = pair.reserve1;
        
        let reserve0Big = new BigNumber(reserve0)
        reserve0 = reserve0Big.div(new BigNumber(10).pow(token0Info.decimals))

        let reserve1Big = new BigNumber(reserve1)
        reserve1 = reserve1Big.div(new BigNumber(10).pow(token1Info.decimals))

        const liquidity  = liquidityUSDPerDay[Object.keys(liquidityUSDPerDay).length - 1].liquidity;
        const liquidity48  = liquidityUSDPerDay[Object.keys(liquidityUSDPerDay).length - 2].liquidity;


        let currentChangeVol= parseFloat(volume) - parseFloat(volume48)
        let previousChangeVol = parseFloat(volume) + parseFloat(volume48) / 2;
        const adjustedPercentChangeVol = (parseFloat(currentChangeVol / previousChangeVol)) * 100

        let currentChangeLiq= parseFloat(liquidity) - parseFloat(liquidity48)
        let previousChangeLiq = parseFloat(liquidity) + parseFloat(liquidity48) / 2;
        const adjustedPercentChangeLiq = (parseFloat(currentChangeLiq / previousChangeLiq)) * 100
          
        return {volume0USDPerDay, volume0USDTotal, volume1USDPerDay, reserve0, reserve1,
           volume1USDTotal,pairTotalLiquidity,liquidityUSDPerDay, token0Address, 
           token1Address, token0Info, token1Info, pairAddress, oneDayVolumeUSD: volume,
            reserveUSD: liquidity, volumeWeek, volumeChangeUSD: adjustedPercentChangeVol, liquidityChangeUSD: adjustedPercentChangeLiq }
      })
    )
    return pairsData;
  } catch (e) {
    console.log(e)
  }
}

const getPairTransactions = async (pairAddress, allPairData) => {
  let transactions = {}
  try {
    let result = await testClient.query({
      query: GLOBAL_TXNS_BASED_BY_PAIR,
      fetchPolicy: 'cache-first',
        variables: {
        pairAddress: pairAddress,
        limit: 100,
        skip: 0
      },
    })
    transactions.mints = []
    transactions.burns = []
    transactions.swaps = []

    result?.data?.getTxsByPair &&
      result.data.getTxsByPair.map((transaction) => {
      let pair = allPairData[transaction.pairAddress];
      
      
      if( pair && pair.token1Info ){


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

const getPairChartData = async (pairAddress, pairs) => {
  let data = []
  const utcEndTime = dayjs.utc()
  let utcStartTime = utcEndTime.subtract(1, 'year').startOf('minute')
  let startTime = utcStartTime.unix() - 1
  let dataFinal = []
  const year = 31536000;

  const utcCurrentTime = dayjs().utc();
  var dataRcv = []
  var dataPerDay = []

  try {
    let allFound = false
    let skip = 0
    while (!allFound) {
      let result = await testClient.query({
        query: PAIR_VOLUMES_DATA_BY_DATE,
        variables: {
          pairAddress: pairAddress,
          startTime: utcCurrentTime.unix() - year,
          endTime: utcCurrentTime.unix(),
          limit: 1000,
          skip: skip
        },
        fetchPolicy: 'cache-first',
      })
      skip += 1000
      dataRcv = dataRcv.concat(result.data.getPairDaysVolumeByDate)
      if (result.data.getPairDaysVolumeByDate.length < 1000) {
        allFound = true
      }
    }

    let counter = 0;
    let currentTime = 0;
    let volumeUsd = 0;
    let liquid = 0;

    let lastDayTime = 0;

    dataRcv.forEach((dayData, i) => {
      if(i === 0){
        currentTime = dayData.timeStamp;
      }
      const utcCurrentTime = dayjs.unix(currentTime).utcOffset(0).startOf('date').unix();
      const utcDayTime = dayjs.unix(dayData.timeStamp).utcOffset(0).startOf('date').unix();
      lastDayTime = utcCurrentTime;
      if( utcDayTime > utcCurrentTime ){
        dataFinal = {id: counter, date: utcCurrentTime,
          totalVolumeUSD: 0, dailyVolumeUSD: parseFloat(volumeUsd), dailyVolumeETH: 0,
          reserveUSD: liquid, totalLiquidityETH: 0  }
          dataPerDay.push(dataFinal)
          volumeUsd = 0;
          currentTime = dayData.timeStamp;
          liquid = 0;
      }
      volumeUsd += dayData.volume0USD;
      liquid = dayData.liquidityUSD;
    })

    dataFinal = {id: counter, date: lastDayTime,
      totalVolumeUSD: 0, dailyVolumeUSD: parseFloat(volumeUsd), dailyVolumeETH: 0,
      reserveUSD: liquid, totalLiquidityETH: 0  }
    dataPerDay.push(dataFinal)

    let dayIndexSet = new Set()
    let dayIndexArray = []
    const oneDay = 24 * 60 * 60
    dataPerDay.forEach((dayData, i) => {
      // add the day index to the set of days
      dayIndexSet.add((dataPerDay[i].date / oneDay).toFixed(0))
      dayIndexArray.push(dataPerDay[i])
      dayData.dailyVolumeUSD = parseFloat(dayData.dailyVolumeUSD)
      dayData.reserveUSD = parseFloat(dayData.reserveUSD)
      data.push(dayData);
    })

    if (data[0]) {
      // fill in empty days
      let timestamp = data[0].date ? data[0].date : startTime
      let latestLiquidityUSD = data[0].reserveUSD
      let index = 1
      while (timestamp < utcEndTime.unix() - oneDay) {
        const nextDay = timestamp + oneDay
        let currentDayIndex = (nextDay / oneDay).toFixed(0)
        if (!dayIndexSet.has(currentDayIndex)) {
          data.push({
            date: nextDay,
            dayString: nextDay,
            dailyVolumeUSD: 0,
            reserveUSD: latestLiquidityUSD,
          })
        } else {
          latestLiquidityUSD = dayIndexArray[index].reserveUSD
          index = index + 1
        }
        timestamp = nextDay
      }
    }

    data = data.sort((a, b) => (parseInt(a.date) > parseInt(b.date) ? 1 : -1))
  } catch (e) {
    console.log(e)
  }

  return data
}

export function Updater() {
  const [, { updateTopPairs }] = usePairDataContext()
  const [ethPrice] = useEthPrice()

  useEffect(() => {
    async function getData() {
      // get top pairs by reserves
      let {
        data: { pairMany },
      } = await testClient.query({
        query: PAIRS_CURRENT,
        fetchPolicy: 'cache-first',
      })
      let pairsWhiteList = []
      pairMany.forEach((pair, i) => {
        // Ignore some pairs
        if(pair.pairAddress !== '0xd4dddf08f12e8ea1d7dd5a47418cdf3d93a5be96' &&
         pair.pairAddress !== '0xf799aea5df9fc8fac93d5e2a5277b4e82817ccb5'){
          pairsWhiteList.push(pair);
        }
      })
      let pairsData = await getPairData(pairsWhiteList, ethPrice)
      pairsData && updateTopPairs(pairsData)
    }
    ethPrice && getData()
  }, [ethPrice, updateTopPairs])
  return null
}

export function useHourlyRateData(pairAddress, timeWindow) {
  return []
}

/**
 * @todo
 * store these updates to reduce future redundant calls
 */
export function useDataForList(pairList) {
  const [state] = usePairDataContext()
  const [ethPrice] = useEthPrice()

  const [stale, setStale] = useState(false)
  const [fetched, setFetched] = useState([])

  // reset
  useEffect(() => {
    if (pairList) {
      setStale(false)
      setFetched()
    }
  }, [pairList])

  let formattedFetch =
    fetched &&
    fetched.reduce((obj, cur) => {
      return { ...obj, [cur?.id]: cur }
    }, {})

  return formattedFetch
}

/**
 * Get all the current and 24hr changes for a pair
 */
export function usePairData(pairAddress) {
  const [state, { update }] = usePairDataContext()
  const pairData = state?.[pairAddress]

  return pairData || {}
}

/**
 * Get most recent txns for a pair
 */
export function usePairTransactions(pairAddress) {
  const [state, { updatePairTxns }] = usePairDataContext()
  const pairTxns = state?.[pairAddress]?.txns
  const allPairsData = useAllPairData()

  useEffect(() => {
    async function checkForTxns() {
      if (!pairTxns &&  Object.keys(allPairsData).length > 0) {
        let transactions = await getPairTransactions(pairAddress, allPairsData)
        updatePairTxns(pairAddress, transactions)
      }
    }
    checkForTxns()
  }, [pairTxns, pairAddress, updatePairTxns, allPairsData])
  return pairTxns
}

export function usePairChartData(pairAddress) {
  const [state, { updateChartData }] = usePairDataContext()
  const chartData = state?.[pairAddress]?.chartData

  useEffect(() => {
    async function checkForChartData() {
      if (!chartData) {
        let data = await getPairChartData(pairAddress, state)
        updateChartData(pairAddress, data)
      }
    }
    checkForChartData()
  }, [chartData, pairAddress, updateChartData])
  return chartData
}

/**
 * Get list of all pairs in Uniswap
 */
export function useAllPairData() {
  const [state] = usePairDataContext()
  return state || {}
}
