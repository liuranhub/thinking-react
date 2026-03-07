import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import 'antd/dist/reset.css';
import '../App.css';
import { API_HOST } from '../config/config';
import { get, post } from '../utils/httpClient';
import { renderKlineChart } from '../utils/renderKlineChart';

const BG_COLOR = '#181c26';
const TEXT_COLOR = '#fff';

// 网格配置（默认4宫格）
const GRID_COLS_4 = 2; // 4宫格列数
const GRID_ROWS_4 = 2; // 4宫格行数
const GRID_COUNT_4 = GRID_COLS_4 * GRID_ROWS_4; // 4宫格总网格数

// 9宫格配置
const GRID_COLS_9 = 3; // 9宫格列数
const GRID_ROWS_9 = 3; // 9宫格行数
const GRID_COUNT_9 = GRID_COLS_9 * GRID_ROWS_9; // 9宫格总网格数

// 1支股票模式：四个网格对应的时间范围（年）
const GRID_RANGES = [1, 2, 5, 10];

// 模式类型
const MODE_1_STOCK = '1stock'; // 1支股票，四块区域分别显示1年、2年、5年、10年
const MODE_2_STOCK = '2stock'; // 2支股票，左上=股票1(1年), 左下=股票1(10年), 右上=股票2(1年), 右下=股票2(10年)
const MODE_4_STOCK = '4stock'; // 4支股票，每个网格显示一支股票
const MODE_9_STOCK = '9stock'; // 9支股票，每个网格显示一支股票

function getDateNDaysAgo(dateStr, years) {
  const d = new Date(dateStr);
  if (years < 1) {
    const months = Math.round(years * 12);
    d.setMonth(d.getMonth() - months);
  } else {
    d.setFullYear(d.getFullYear() - years);
  }
  return d.toISOString().slice(0, 10);
}

// 格式化数值函数
function formatNumber(num, length = 2) {
  if (num === null || num === undefined || num === '') return num;
  const parsed = parseFloat(num);
  if (isNaN(parsed)) return num;
  const decimalPlaces = (parsed.toString().split('.')[1] || '').length;
  return decimalPlaces > length ? parsed.toFixed(length) : parsed.toString();
}

const StockDetailGrid = () => {
  const location = useLocation();
  
  // 模式选择：1支、2支、4支
  const [mode, setMode] = useState(MODE_1_STOCK);
  
  // 股票列表 - 优先从 location.state 获取，如果没有则从 sessionStorage 获取
  const [stockList, setStockList] = useState(() => {
    if (location.state?.stockList) {
      return location.state.stockList;
    }
    try {
      const stored = sessionStorage.getItem('stockList');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse stockList from sessionStorage:', e);
    }
    return [];
  });

  // 统一的股票索引（所有模式共享）
  const [baseIndex, setBaseIndex] = useState(0);
  
  // 区间选择：2支模式上面两个区域的年份，默认1年
  const [rangeYearsTop, setRangeYearsTop] = useState(1);
  // 区间选择：2支模式下面两个区域的年份，默认10年
  const [rangeYearsBottom, setRangeYearsBottom] = useState(10);
  // 区间选择：4支模式的年份，默认10年
  const [rangeYears, setRangeYears] = useState(10);
  // 区间选择：9支模式的年份，默认0.5年（半年）
  const [rangeYears9, setRangeYears9] = useState(0.5);
  
  // 每个股票的K线数据
  const [stocksData, setStocksData] = useState({});
  
  // 股票详情数据
  const [stockDetails, setStockDetails] = useState({});
  
  // 最新股价数据 { stockCode: { closePrice, zhangDieFu, ... } }
  const [latestStockDataMap, setLatestStockDataMap] = useState({});
  
  // 股票分数数据 { stockCode: { score, extraScore, ... } }
  const [stockScoresMap, setStockScoresMap] = useState({});
  
  // 是否显示股票详细信息（市值、股价、涨跌幅、分数）
  const [showStockInfo, setShowStockInfo] = useState(true);
  
  // 选中的网格标识（格式：'gridIndex' 或 'stockCode-rangeYears'）
  const [selectedGrid, setSelectedGrid] = useState(null);
  
  // 发送选中股票代码到后端
  const sendSelectStockCode = useCallback(async (stockCode) => {
    if (!stockCode) return;
    
    try {
      const url = `${API_HOST}/websocket/broadcast/sendSelectStockCode?stockCode=${encodeURIComponent(stockCode)}`;
      await get(url);
      console.log('已发送选中股票代码:', stockCode);
    } catch (error) {
      console.error('发送选中股票代码失败:', error);
    }
  }, []);
  
  // 图表实例引用
  const chartsRef = useRef({});
  
  // 窗口高度
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [headerHeight, setHeaderHeight] = useState(60);

  // 当前显示的股票（1支模式）
  const currentStock = stockList[baseIndex] || null;

  // 获取当前显示的股票（2支模式）
  const getCurrentStocks2 = () => {
    if (stockList.length === 0) return [null, null];
    const leftStock = stockList[baseIndex] || null;
    const rightStock = stockList[baseIndex + 1] || null;
    return [leftStock, rightStock];
  };

  // 获取当前显示的股票（4支模式）
  const getCurrentStocks4 = () => {
    return stockList.slice(baseIndex, baseIndex + GRID_COUNT_4);
  };

  // 获取当前显示的股票（9支模式）
  const getCurrentStocks9 = () => {
    return stockList.slice(baseIndex, baseIndex + GRID_COUNT_9);
  };

  // 确保 baseIndex 在有效范围内
  useEffect(() => {
    if (stockList.length > 0 && baseIndex >= stockList.length) {
      setBaseIndex(0);
    }
  }, [stockList, baseIndex]);

  // 窗口大小变化处理
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
      setHeaderHeight(60);
      // 重新调整所有图表大小
      Object.values(chartsRef.current).forEach(chartGroup => {
        if (chartGroup && chartGroup.klineChart) {
          chartGroup.klineChart.resize();
        }
        if (chartGroup && chartGroup.volumeChart) {
          chartGroup.volumeChart.resize();
        }
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 键盘上下键切换股票（统一使用 baseIndex）
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!stockList.length) return;
      if (e.key === 'ArrowUp') {
        if (mode === MODE_1_STOCK) {
          setBaseIndex(idx => Math.max(0, idx - 1));
        } else if (mode === MODE_2_STOCK) {
          setBaseIndex(idx => Math.max(0, idx - 2));
        } else if (mode === MODE_4_STOCK) {
          setBaseIndex(idx => Math.max(0, idx - GRID_COUNT_4));
        } else if (mode === MODE_9_STOCK) {
          setBaseIndex(idx => Math.max(0, idx - GRID_COUNT_9));
        }
      }
      if (e.key === 'ArrowDown') {
        if (mode === MODE_1_STOCK) {
          setBaseIndex(idx => Math.min(stockList.length - 1, idx + 1));
        } else if (mode === MODE_2_STOCK) {
          const maxIndex = Math.max(0, stockList.length - 2);
          setBaseIndex(idx => Math.min(maxIndex, idx + 2));
        } else if (mode === MODE_4_STOCK) {
          const maxIndex = Math.max(0, stockList.length - GRID_COUNT_4);
          setBaseIndex(idx => Math.min(maxIndex, idx + GRID_COUNT_4));
        } else if (mode === MODE_9_STOCK) {
          const maxIndex = Math.max(0, stockList.length - GRID_COUNT_9);
          setBaseIndex(idx => Math.min(maxIndex, idx + GRID_COUNT_9));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stockList, mode]);

  // stockList丢失时跳回首页
  useEffect(() => {
    if (!stockList.length) {
      alert('请从股票列表进入详情页');
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get('tab') || 'all';
      const state = urlParams.get('state');
      if (state) {
        window.location.href = `/?tab=${tab}&state=${state}`;
      } else {
        window.location.href = '/';
      }
    }
  }, [stockList]);

  // 批量获取多支股票的K线数据
  const fetchStockDataBatch = useCallback(async (stockCodes) => {
    if (!stockCodes || stockCodes.length === 0) {
      console.log('批量加载：股票代码为空');
      return;
    }

    console.log('批量加载：开始处理股票代码', stockCodes);
    
    // 直接使用传入的 stockCodes，因为已经在 useEffect 中过滤过了
    const stocksToLoad = stockCodes;

    // 设置加载状态
    setStocksData(prev => {
      const newData = { ...prev };
      stocksToLoad.forEach(code => {
        newData[code] = { ...prev[code], loading: true, error: null };
      });
      return newData;
    });

    try {
      // 构建批量请求URL，stockCodes作为查询参数
      const url = new URL(API_HOST + `/stock/stockDetail/dayKLine/compressBatch`);
      url.searchParams.set('stockCodes', stocksToLoad.join(','));
      
      console.log('批量加载：调用批量接口', url.toString());
      console.log('批量加载：请求参数 stockCodes=', stocksToLoad.join(','));
      
      const response = await get(url.toString(), {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
        }
      });

      console.log('批量加载：接口返回', response);

      if (!response || typeof response !== 'object') {
        // 批量请求失败，设置所有股票的错误状态
        setStocksData(prev => {
          const newData = { ...prev };
          stocksToLoad.forEach(code => {
            newData[code] = { ...prev[code], loading: false, error: '数据加载失败' };
          });
          return newData;
        });
        return;
      }

      // 解析返回的Map格式数据：Map<String, List<String>>
      // response 是一个对象，key是股票代码，value是字符串数组
      const processedData = {};
      
      stocksToLoad.forEach(stockCode => {
        const data = response[stockCode];
        
        if (!data || !Array.isArray(data)) {
          processedData[stockCode] = { error: '数据加载失败', data: null };
          return;
        }

        // 解析紧凑数据格式
        const parsedData = data.map(item => {
          const [date, openPrice, closePrice, minPrice, maxPrice, chenJiaoLiang, zhangDieFu, huanShouLv, zhenFu] = item.split(',');
          return {
            date,
            openPrice: parseFloat(openPrice),
            closePrice: parseFloat(closePrice),
            minPrice: parseFloat(minPrice),
            maxPrice: parseFloat(maxPrice),
            chenJiaoLiang: parseFloat(chenJiaoLiang),
            zhangDieFu: parseFloat(zhangDieFu),
            huanShouLv: parseFloat(huanShouLv),
            zhenFu: parseFloat(zhenFu)
          };
        });
        
        const sorted = parsedData.slice().sort((a, b) => a.date.localeCompare(b.date));
        processedData[stockCode] = { error: null, data: sorted };
      });

      // 批量更新 stocksData
      setStocksData(prev => {
        const newData = { ...prev };
        
        stocksToLoad.forEach(stockCode => {
          const { error, data } = processedData[stockCode];
          
          if (error) {
            newData[stockCode] = { ...prev[stockCode], loading: false, error };
          } else if (data) {
            const sorted = data;
            
            // 根据模式处理数据
            if (mode === MODE_2_STOCK) {
              const allDates = sorted.map(item => item.date);
              const maxDate = allDates[allDates.length - 1];
              const minDate = allDates[0];
              
              const chartData = {};
              // 缓存1年数据
              const startDate1 = getDateNDaysAgo(maxDate, 1);
              const chartStartDate1 = startDate1 < minDate ? minDate : startDate1;
              chartData[1] = sorted.filter(item => item.date >= chartStartDate1 && item.date <= maxDate);
              
              // 缓存10年数据
              const startDate10 = getDateNDaysAgo(maxDate, 10);
              const chartStartDate10 = startDate10 < minDate ? minDate : startDate10;
              chartData[10] = sorted.filter(item => item.date >= chartStartDate10 && item.date <= maxDate);
              
              newData[stockCode] = {
                allStockData: sorted,
                chartData,
                loading: false,
                error: null
              };
            } else if (mode === MODE_4_STOCK) {
              const allDates = sorted.map(item => item.date);
              const maxDate = allDates[allDates.length - 1];
              const minDate = allDates[0];
              const startDate = getDateNDaysAgo(maxDate, rangeYears);
              const chartStartDate = startDate < minDate ? minDate : startDate;
              const filtered = sorted.filter(item => item.date >= chartStartDate && item.date <= maxDate);
              
              newData[stockCode] = {
                allStockData: sorted,
                chartData: Array.isArray(filtered) ? filtered : [],
                loading: false,
                error: null
              };
            } else if (mode === MODE_9_STOCK) {
              const allDates = sorted.map(item => item.date);
              const maxDate = allDates[allDates.length - 1];
              const minDate = allDates[0];
              const startDate = getDateNDaysAgo(maxDate, rangeYears9);
              const chartStartDate = startDate < minDate ? minDate : startDate;
              const filtered = sorted.filter(item => item.date >= chartStartDate && item.date <= maxDate);
              
              newData[stockCode] = {
                allStockData: sorted,
                chartData: Array.isArray(filtered) ? filtered : [],
                loading: false,
                error: null
              };
            } else {
              newData[stockCode] = {
                allStockData: sorted,
                loading: false,
                error: null
              };
            }
          }
        });
        
        return newData;
      });
    } catch (err) {
      // 批量请求失败，设置所有股票的错误状态
      setStocksData(prev => {
        const newData = { ...prev };
        stocksToLoad.forEach(code => {
          newData[code] = { ...prev[code], loading: false, error: err.message };
        });
        return newData;
      });
    }
  }, [mode, rangeYears, rangeYears9]);

  // 获取单支股票的K线数据（保留用于兼容，但优先使用批量接口）
  const fetchStockData = async (stockCode) => {
    if (stocksData[stockCode]?.loading) return;
    
    setStocksData(prev => ({
      ...prev,
      [stockCode]: { ...prev[stockCode], loading: true, error: null }
    }));

    try {
      const url = new URL(API_HOST + `/stock/stockDetail/dayKLine/${stockCode}/compress`);
      const data = await get(url.toString(), {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
        }
      });

      if (!data || !Array.isArray(data)) {
        setStocksData(prev => ({
          ...prev,
          [stockCode]: { ...prev[stockCode], loading: false, error: '数据加载失败' }
        }));
        return;
      }

      // 解析紧凑数据格式
      const parsedData = data.map(item => {
        const [date, openPrice, closePrice, minPrice, maxPrice, chenJiaoLiang, zhangDieFu, huanShouLv, zhenFu] = item.split(',');
        return {
          date,
          openPrice: parseFloat(openPrice),
          closePrice: parseFloat(closePrice),
          minPrice: parseFloat(minPrice),
          maxPrice: parseFloat(maxPrice),
          chenJiaoLiang: parseFloat(chenJiaoLiang),
          zhangDieFu: parseFloat(zhangDieFu),
          huanShouLv: parseFloat(huanShouLv),
          zhenFu: parseFloat(zhenFu)
        };
      });
      
      const sorted = parsedData.slice().sort((a, b) => a.date.localeCompare(b.date));

      // 根据模式处理数据
      if (mode === MODE_2_STOCK) {
        // 2支模式：缓存不同年份的数据（chartData 是对象）
        setStocksData(prev => {
          const newData = {
            ...prev,
            [stockCode]: {
              allStockData: sorted,
              chartData: {},
              loading: false,
              error: null
            }
          };
          
          const allDates = sorted.map(item => item.date);
          const maxDate = allDates[allDates.length - 1];
          const minDate = allDates[0];
          
          // 缓存1年数据
          const startDate1 = getDateNDaysAgo(maxDate, 1);
          const chartStartDate1 = startDate1 < minDate ? minDate : startDate1;
          const filtered1 = sorted.filter(item => item.date >= chartStartDate1 && item.date <= maxDate);
          newData[stockCode].chartData[1] = filtered1;
          
          // 缓存10年数据
          const startDate10 = getDateNDaysAgo(maxDate, 10);
          const chartStartDate10 = startDate10 < minDate ? minDate : startDate10;
          const filtered10 = sorted.filter(item => item.date >= chartStartDate10 && item.date <= maxDate);
          newData[stockCode].chartData[10] = filtered10;
          
          return newData;
        });
      } else if (mode === MODE_4_STOCK) {
        // 4支模式：计算区间数据（chartData 是数组）
        const allDates = sorted.map(item => item.date);
        const maxDate = allDates[allDates.length - 1];
        const minDate = allDates[0];
        const startDate = getDateNDaysAgo(maxDate, rangeYears);
        const chartStartDate = startDate < minDate ? minDate : startDate;
        const filtered = sorted.filter(item => item.date >= chartStartDate && item.date <= maxDate);

        setStocksData(prev => ({
          ...prev,
          [stockCode]: {
            allStockData: sorted,
            chartData: Array.isArray(filtered) ? filtered : [],
            loading: false,
            error: null
          }
        }));
      } else if (mode === MODE_9_STOCK) {
        // 9支模式：计算区间数据（chartData 是数组），默认半年
        const allDates = sorted.map(item => item.date);
        const maxDate = allDates[allDates.length - 1];
        const minDate = allDates[0];
        const startDate = getDateNDaysAgo(maxDate, rangeYears9);
        const chartStartDate = startDate < minDate ? minDate : startDate;
        const filtered = sorted.filter(item => item.date >= chartStartDate && item.date <= maxDate);

        setStocksData(prev => ({
          ...prev,
          [stockCode]: {
            allStockData: sorted,
            chartData: Array.isArray(filtered) ? filtered : [],
            loading: false,
            error: null
          }
        }));
      } else {
        // 1支模式：只存储全量数据（不存储 chartData）
        setStocksData(prev => ({
          ...prev,
          [stockCode]: {
            allStockData: sorted,
            loading: false,
            error: null
          }
        }));
      }
    } catch (err) {
      setStocksData(prev => ({
        ...prev,
        [stockCode]: { ...prev[stockCode], loading: false, error: err.message }
      }));
    }
  };

  // 根据年份获取过滤后的数据（2支模式）
  const getFilteredData = (stockCode, years) => {
    const stockData = stocksData[stockCode];
    if (!stockData || !stockData.allStockData || stockData.allStockData.length === 0) {
      return [];
    }

    // 确保 chartData 是对象且包含对应年份的数据
    if (stockData.chartData && 
        stockData.chartData instanceof Object && 
        !Array.isArray(stockData.chartData) &&
        stockData.chartData[years] &&
        Array.isArray(stockData.chartData[years])) {
      return stockData.chartData[years];
    }

    // 如果缓存中没有，从 allStockData 计算
    const allDates = stockData.allStockData.map(item => item.date);
    const maxDate = allDates[allDates.length - 1];
    const minDate = allDates[0];
    const startDate = getDateNDaysAgo(maxDate, years);
    const chartStartDate = startDate < minDate ? minDate : startDate;
    const filtered = stockData.allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);

    return filtered;
  };

  // 获取股票详情数据
  const fetchStockDetail = async (stockCode) => {
    if (stockDetails[stockCode]) return;
    
    try {
      const detail = await get(API_HOST + `/stock/stockDetail/${stockCode}`);
      if (detail) {
        setStockDetails(prev => ({
          ...prev,
          [stockCode]: detail
        }));
      }
    } catch (err) {
      console.error('获取股票详情失败:', err);
    }
  };

  // 获取最新股价数据
  const fetchLatestStockData = async (stockCode) => {
    if (latestStockDataMap[stockCode]) return; // 已加载，跳过
    
    try {
      const latestData = await get(API_HOST + `/stock/getStockKLineLatestData/${stockCode}`);
      if (latestData) {
        setLatestStockDataMap(prev => ({
          ...prev,
          [stockCode]: latestData
        }));
      }
    } catch (err) {
      console.error('获取最新股价失败:', err);
    }
  };

  // 获取股票分数
  const fetchStockScore = async (stockCode) => {
    if (stockScoresMap[stockCode]) return; // 已加载，跳过
    
    // 等待 stocksData 加载完成
    const stockData = stocksData[stockCode];
    if (!stockData || !stockData.allStockData || stockData.allStockData.length === 0) {
      return;
    }
    
    try {
      // 获取最新日期作为结束日期
      const allDates = stockData.allStockData.map(item => item.date);
      const chartEndDate = allDates[allDates.length - 1];
      
      if (!chartEndDate) return;
      
      const data = await post(API_HOST + `/stock/stockScoreAnalyser/${stockCode}/${chartEndDate}`);
      if (data && data !== null) {
        setStockScoresMap(prev => ({
          ...prev,
          [stockCode]: data
        }));
      }
    } catch (err) {
      console.error('获取股票分数失败:', err);
    }
  };

  // 2支模式：预加载和缓存不同年份的数据
  useEffect(() => {
    if (mode !== MODE_2_STOCK) return;
    
    const currentStocks = getCurrentStocks2();
    let hasUpdate = false;

    setStocksData(prev => {
      const updatedData = { ...prev };
      currentStocks.forEach(stock => {
        if (stock?.stockCode) {
          const stockData = prev[stock.stockCode];
          if (stockData && stockData.allStockData && stockData.allStockData.length > 0) {
            if (!updatedData[stock.stockCode]) {
              updatedData[stock.stockCode] = { ...stockData };
            }
            // 确保 chartData 是对象（2支模式需要对象，其他模式可能是数组）
            if (!updatedData[stock.stockCode].chartData || !(updatedData[stock.stockCode].chartData instanceof Object) || Array.isArray(updatedData[stock.stockCode].chartData)) {
              updatedData[stock.stockCode].chartData = {};
            }

            if (!updatedData[stock.stockCode].chartData[rangeYearsTop]) {
              const allDates = stockData.allStockData.map(item => item.date);
              const maxDate = allDates[allDates.length - 1];
              const minDate = allDates[0];
              const startDate = getDateNDaysAgo(maxDate, rangeYearsTop);
              const chartStartDate = startDate < minDate ? minDate : startDate;
              const filtered = stockData.allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
              
              updatedData[stock.stockCode].chartData[rangeYearsTop] = filtered;
              hasUpdate = true;
            }

            if (!updatedData[stock.stockCode].chartData[rangeYearsBottom]) {
              const allDates = stockData.allStockData.map(item => item.date);
              const maxDate = allDates[allDates.length - 1];
              const minDate = allDates[0];
              const startDate = getDateNDaysAgo(maxDate, rangeYearsBottom);
              const chartStartDate = startDate < minDate ? minDate : startDate;
              const filtered = stockData.allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
              
              updatedData[stock.stockCode].chartData[rangeYearsBottom] = filtered;
              hasUpdate = true;
            }
          }
        }
      });
      return hasUpdate ? updatedData : prev;
    });
  }, [mode, rangeYearsTop, rangeYearsBottom]);

  // 4支模式：更新区间数据
  useEffect(() => {
    if (mode !== MODE_4_STOCK) return;
    
    const currentStocks = getCurrentStocks4();
    currentStocks.forEach(stock => {
      if (stock?.stockCode) {
        const stockData = stocksData[stock.stockCode];
        if (stockData && stockData.allStockData && stockData.allStockData.length > 0) {
          const allDates = stockData.allStockData.map(item => item.date);
          const maxDate = allDates[allDates.length - 1];
          const minDate = allDates[0];
          const startDate = getDateNDaysAgo(maxDate, rangeYears);
          const chartStartDate = startDate < minDate ? minDate : startDate;
          const filtered = stockData.allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
          
          setStocksData(prev => ({
            ...prev,
            [stock.stockCode]: {
              ...prev[stock.stockCode],
              chartData: Array.isArray(filtered) ? filtered : []
            }
          }));
        }
      }
    });
  }, [mode, rangeYears]);

  // 9支模式：更新区间数据
  useEffect(() => {
    if (mode !== MODE_9_STOCK) return;
    
    const currentStocks = getCurrentStocks9();
    currentStocks.forEach(stock => {
      if (stock?.stockCode) {
        const stockData = stocksData[stock.stockCode];
        if (stockData && stockData.allStockData && stockData.allStockData.length > 0) {
          const allDates = stockData.allStockData.map(item => item.date);
          const maxDate = allDates[allDates.length - 1];
          const minDate = allDates[0];
          const startDate = getDateNDaysAgo(maxDate, rangeYears9);
          const chartStartDate = startDate < minDate ? minDate : startDate;
          const filtered = stockData.allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
          
          setStocksData(prev => ({
            ...prev,
            [stock.stockCode]: {
              ...prev[stock.stockCode],
              chartData: Array.isArray(filtered) ? filtered : []
            }
          }));
        }
      }
    });
  }, [mode, rangeYears9]);

  // 当显示的股票变化时，批量加载数据
  useEffect(() => {
    let stockCodes = [];
    
    if (mode === MODE_1_STOCK) {
      if (currentStock?.stockCode) {
        stockCodes = [currentStock.stockCode];
      }
    } else if (mode === MODE_2_STOCK) {
      const currentStocks = getCurrentStocks2();
      stockCodes = currentStocks
        .filter(stock => stock?.stockCode)
        .map(stock => stock.stockCode);
    } else if (mode === MODE_4_STOCK) {
      const currentStocks = getCurrentStocks4();
      stockCodes = currentStocks
        .filter(stock => stock?.stockCode)
        .map(stock => stock.stockCode);
    } else if (mode === MODE_9_STOCK) {
      const currentStocks = getCurrentStocks9();
      stockCodes = currentStocks
        .filter(stock => stock?.stockCode)
        .map(stock => stock.stockCode);
    }

    if (stockCodes.length > 0) {
      console.log('useEffect：准备批量加载股票数据，模式:', mode, '股票代码:', stockCodes);
      console.log('useEffect：当前 stocksData 状态:', Object.keys(stocksData));
      
      // 过滤出需要加载的股票代码（在调用前检查，避免在函数内部通过 setState 获取）
      const stocksToLoad = stockCodes.filter(code => {
        const stockData = stocksData[code];
        const needLoad = !stockData || stockData.loading === undefined;
        if (!needLoad) {
          console.log(`股票 ${code} 已有数据，跳过加载`);
        }
        return needLoad;
      });
      
      console.log('useEffect：需要加载的股票', stocksToLoad);
      
      if (stocksToLoad.length > 0) {
        // 使用批量接口获取K线数据
        fetchStockDataBatch(stocksToLoad);
      } else {
        console.log('useEffect：所有股票数据已存在，跳过批量加载');
      }
      
      // 并行加载详情和最新数据
      stockCodes.forEach(stockCode => {
        if (!stockDetails[stockCode]) {
          fetchStockDetail(stockCode);
        }
        if (!latestStockDataMap[stockCode]) {
          fetchLatestStockData(stockCode);
        }
      });
    }
    // 注意：不将 stocksData、stockDetails、latestStockDataMap 作为依赖项，避免无限循环
    // 只在 mode、currentStock、baseIndex 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentStock, baseIndex, fetchStockDataBatch]);

  // 当 stocksData 加载完成后，自动获取分数
  useEffect(() => {
    const stockCodes = [];
    if (mode === MODE_1_STOCK && currentStock?.stockCode) {
      stockCodes.push(currentStock.stockCode);
    } else if (mode === MODE_2_STOCK) {
      const currentStocks = getCurrentStocks2();
      currentStocks.forEach(stock => {
        if (stock?.stockCode) stockCodes.push(stock.stockCode);
      });
    } else if (mode === MODE_4_STOCK) {
      const currentStocks = getCurrentStocks4();
      currentStocks.forEach(stock => {
        if (stock?.stockCode) stockCodes.push(stock.stockCode);
      });
    } else if (mode === MODE_9_STOCK) {
      const currentStocks = getCurrentStocks9();
      currentStocks.forEach(stock => {
        if (stock?.stockCode) stockCodes.push(stock.stockCode);
      });
    }

    stockCodes.forEach(stockCode => {
      const stockData = stocksData[stockCode];
      if (stockData && stockData.allStockData && stockData.allStockData.length > 0) {
        if (!stockScoresMap[stockCode]) {
          fetchStockScore(stockCode);
        }
      }
    });
  }, [mode, currentStock, baseIndex, stocksData]);

  // 渲染单个网格的图表
  const renderGridCharts = (stock, gridIndex, rangeYearsParam) => {
    const stockCode = stock?.stockCode;
    if (!stockCode) return;

    let chartData = [];
    let allStockData = [];

    if (mode === MODE_1_STOCK) {
      // 1支模式：根据rangeYearsParam计算chartData
      const stockData = stocksData[stockCode];
      if (!stockData || !stockData.allStockData || stockData.allStockData.length === 0) {
        return;
      }
      allStockData = stockData.allStockData;
      const allDates = allStockData.map(item => item.date);
      const maxDate = allDates[allDates.length - 1];
      const minDate = allDates[0];
      const startDate = getDateNDaysAgo(maxDate, rangeYearsParam);
      const chartStartDate = startDate < minDate ? minDate : startDate;
      chartData = allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
    } else if (mode === MODE_2_STOCK) {
      // 2支模式：根据gridIndex确定使用的年份
      const years = (gridIndex === 0 || gridIndex === 2) ? rangeYearsTop : rangeYearsBottom;
      const stockData = stocksData[stockCode];
      if (!stockData || !stockData.allStockData || stockData.allStockData.length === 0) {
        return;
      }
      allStockData = stockData.allStockData;
      chartData = getFilteredData(stockCode, years);
    } else if (mode === MODE_4_STOCK) {
      // 4支模式：使用chartData
      const stockData = stocksData[stockCode];
      if (!stockData || !stockData.allStockData || stockData.allStockData.length === 0) {
        return;
      }
      allStockData = stockData.allStockData;
      // 确保 chartData 是数组
      if (stockData.chartData && Array.isArray(stockData.chartData) && stockData.chartData.length > 0) {
        chartData = stockData.chartData;
      } else {
        // 如果 chartData 不存在或不是数组，从 allStockData 计算
        const allDates = allStockData.map(item => item.date);
        const maxDate = allDates[allDates.length - 1];
        const minDate = allDates[0];
        const startDate = getDateNDaysAgo(maxDate, rangeYears);
        const chartStartDate = startDate < minDate ? minDate : startDate;
        chartData = allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
      }
    } else if (mode === MODE_9_STOCK) {
      // 9支模式：使用chartData，默认半年
      const stockData = stocksData[stockCode];
      if (!stockData || !stockData.allStockData || stockData.allStockData.length === 0) {
        return;
      }
      allStockData = stockData.allStockData;
      // 确保 chartData 是数组
      if (stockData.chartData && Array.isArray(stockData.chartData) && stockData.chartData.length > 0) {
        chartData = stockData.chartData;
      } else {
        // 如果 chartData 不存在或不是数组，从 allStockData 计算
        const allDates = allStockData.map(item => item.date);
        const maxDate = allDates[allDates.length - 1];
        const minDate = allDates[0];
        const startDate = getDateNDaysAgo(maxDate, rangeYears9);
        const chartStartDate = startDate < minDate ? minDate : startDate;
        chartData = allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
      }
    }

    // 确保 chartData 是数组且不为空
    if (!Array.isArray(chartData) || chartData.length === 0) {
      return;
    }

    const klineDomId = `kline-chart-${gridIndex}`;
    const volumeDomId = `volume-chart-${gridIndex}`;
    const klineDom = document.getElementById(klineDomId);
    const volumeDom = document.getElementById(volumeDomId);
    
    if (!klineDom || !volumeDom) return;

    const chartKey = mode === MODE_1_STOCK ? `${stockCode}-${rangeYearsParam}` : `${stockCode}-${gridIndex}`;
    const stockDetail = stockDetails[stockCode] || null;
    
    renderKlineChart({
      klineDom,
      volumeDom,
      allStockData,
      chartData,
      chartKey,
      gridIndex,
      chartsRef,
      stockDetail
    });
  };

  // 渲染所有网格的图表
  useEffect(() => {
    // 清理旧的图表实例
    Object.values(chartsRef.current).forEach(chartGroup => {
      if (chartGroup && chartGroup.cleanup) {
        chartGroup.cleanup();
      }
    });
    chartsRef.current = {};

    if (mode === MODE_1_STOCK && currentStock?.stockCode) {
      GRID_RANGES.forEach((rangeYears, index) => {
        setTimeout(() => {
          renderGridCharts(currentStock, index, rangeYears);
        }, 100 * (index + 1));
      });
    } else if (mode === MODE_2_STOCK) {
      const currentStocks = getCurrentStocks2();
      const gridLayout = [
        { stock: currentStocks[0], index: 0 },
        { stock: currentStocks[0], index: 1 },
        { stock: currentStocks[1], index: 2 },
        { stock: currentStocks[1], index: 3 },
      ];
      gridLayout.forEach(({ stock, index }) => {
        if (stock?.stockCode) {
          setTimeout(() => {
            renderGridCharts(stock, index);
          }, 100);
        }
      });
    } else if (mode === MODE_4_STOCK) {
      const currentStocks = getCurrentStocks4();
      currentStocks.forEach((stock, index) => {
        if (stock?.stockCode) {
          setTimeout(() => {
            renderGridCharts(stock, index);
          }, 100);
        }
      });
    } else if (mode === MODE_9_STOCK) {
      const currentStocks = getCurrentStocks9();
      currentStocks.forEach((stock, index) => {
        if (stock?.stockCode) {
          setTimeout(() => {
            renderGridCharts(stock, index);
          }, 100);
        }
      });
    }
  }, [mode, stocksData, currentStock, baseIndex, rangeYearsTop, rangeYearsBottom, rangeYears, rangeYears9, stockDetails]);

  // 清理图表实例
  useEffect(() => {
    return () => {
      Object.values(chartsRef.current).forEach(chartGroup => {
        if (chartGroup && chartGroup.cleanup) {
          chartGroup.cleanup();
        }
      });
      chartsRef.current = {};
    };
  }, []);

  // 渲染网格内容
  const renderGridContent = () => {
    if (mode === MODE_1_STOCK) {
      return GRID_RANGES.map((rangeYears, index) => {
        const stockCode = currentStock?.stockCode;
        const stockData = stockCode ? stocksData[stockCode] : null;
        const isLoading = stockData?.loading;
        const hasError = stockData?.error;
        
        let hasData = false;
        if (stockData?.allStockData && stockData.allStockData.length > 0) {
          const allDates = stockData.allStockData.map(item => item.date);
          const maxDate = allDates[allDates.length - 1];
          const minDate = allDates[0];
          const startDate = getDateNDaysAgo(maxDate, rangeYears);
          const chartStartDate = startDate < minDate ? minDate : startDate;
          const chartData = stockData.allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
          hasData = chartData.length > 0;
        }

        const gridKey = `${stockCode}-${rangeYears}`;
        const isSelected = selectedGrid === gridKey;
        
        return (
          <div
            key={gridKey}
            style={{
              backgroundColor: BG_COLOR,
              border: isSelected ? '2px solid #1e90ff' : '1px solid #23263a',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div 
              style={{
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: TEXT_COLOR,
                borderBottom: '1px solid #23263a',
                backgroundColor: '#23263a',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onDoubleClick={() => {
                const newSelected = isSelected ? null : gridKey;
                setSelectedGrid(newSelected);
                // 如果选中了网格，发送选中消息给后端
                if (newSelected && stockCode) {
                  sendSelectStockCode(stockCode);
                }
              }}
              title="双击选中/取消选中此网格"
            >
              <span>{rangeYears}年K线图</span>
              {showStockInfo && stockCode && (() => {
                const stockDetail = stockDetails[stockCode];
                const latestData = latestStockDataMap[stockCode];
                const scoreData = stockScoresMap[stockCode];
                
                return (
                  <>
                    {stockDetail?.outstandingMarketValue && (
                      <span style={{ color: '#11d1e4', fontSize: '11px' }}>
                        市值: {Number(stockDetail.outstandingMarketValue / 100000000).toFixed(2)}亿
                      </span>
                    )}
                    {latestData && (
                      <>
                        <span style={{ fontSize: '11px' }}>
                          股价: <span style={{
                            color: latestData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestData.closePrice}</span>
                        </span>
                        <span style={{ fontSize: '11px' }}>
                          涨跌幅: <span style={{
                            color: latestData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestData.zhangDieFu >= 0 ? '+' : ''}{formatNumber(latestData.zhangDieFu)}%</span>
                        </span>
                      </>
                    )}
                    {scoreData && (
                      <span style={{ color: '#ffd700', fontSize: '11px' }}>
                        分数: {formatNumber(scoreData.score || 0)}
                        {scoreData.extraScore && (
                          <span style={{ color: '#ffd700' }}> + {formatNumber(scoreData.extraScore)}</span>
                        )}
                        {scoreData.score && scoreData.extraScore && (
                          <span style={{ color: '#1e90ff' }}> (合计: {formatNumber(parseFloat(scoreData.score || 0) + parseFloat(scoreData.extraScore || 0))})</span>
                        )}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
            <div style={{ flex: '70%', position: 'relative' }}>
              {isLoading && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(24,28,38,0.8)',
                  zIndex: 10,
                }}>
                  <Spin size="small" />
                </div>
              )}
              {hasError && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ff4444',
                  fontSize: '12px',
                }}>
                  {hasError}
                </div>
              )}
              {!hasData && !isLoading && !hasError && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: TEXT_COLOR,
                  fontSize: '12px',
                }}>
                  暂无数据
                </div>
              )}
              <div id={`kline-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
            <div style={{ flex: '30%', position: 'relative' }}>
              <div id={`volume-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
          </div>
        );
      });
    } else if (mode === MODE_2_STOCK) {
      const currentStocks = getCurrentStocks2();
      return [
        { stock: currentStocks[0], gridIndex: 0 },
        { stock: currentStocks[1], gridIndex: 2 },
        { stock: currentStocks[0], gridIndex: 1 },
        { stock: currentStocks[1], gridIndex: 3 },
      ].map(({ stock, gridIndex }) => {
        const stockCode = stock?.stockCode;
        const stockData = stockCode ? stocksData[stockCode] : null;
        const isLoading = stockData?.loading;
        const hasError = stockData?.error;
        const years = (gridIndex === 0 || gridIndex === 2) ? rangeYearsTop : rangeYearsBottom;
        const chartData = stockData?.chartData?.[years] || [];
        const hasData = chartData && chartData.length > 0;
        const gridKey = `${stockCode || 'empty'}-${gridIndex}`;
        const isSelected = selectedGrid === gridKey;
        
        return (
          <div
            key={gridKey}
            style={{
              backgroundColor: BG_COLOR,
              border: isSelected ? '2px solid #1e90ff' : '1px solid #23263a',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div 
              style={{
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: TEXT_COLOR,
                borderBottom: '1px solid #23263a',
                backgroundColor: '#23263a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onDoubleClick={() => {
                const newSelected = isSelected ? null : gridKey;
                setSelectedGrid(newSelected);
                // 如果选中了网格，发送选中消息给后端
                if (newSelected && stockCode) {
                  sendSelectStockCode(stockCode);
                }
              }}
              title="双击选中/取消选中此网格"
            >
              <span>{stock?.stockName || '--'} ({stockCode || '--'})</span>
              {showStockInfo && stockCode && (() => {
                const stockDetail = stockDetails[stockCode];
                const latestData = latestStockDataMap[stockCode];
                const scoreData = stockScoresMap[stockCode];
                
                return (
                  <>
                    {stockDetail?.outstandingMarketValue && (
                      <span style={{ color: '#11d1e4', fontSize: '11px' }}>
                        市值: {Number(stockDetail.outstandingMarketValue / 100000000).toFixed(2)}亿
                      </span>
                    )}
                    {latestData && (
                      <>
                        <span style={{ fontSize: '11px' }}>
                          股价: <span style={{
                            color: latestData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestData.closePrice}</span>
                        </span>
                        <span style={{ fontSize: '11px' }}>
                          涨跌幅: <span style={{
                            color: latestData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestData.zhangDieFu >= 0 ? '+' : ''}{formatNumber(latestData.zhangDieFu)}%</span>
                        </span>
                      </>
                    )}
                    {scoreData && (
                      <span style={{ color: '#ffd700', fontSize: '11px' }}>
                        分数: {formatNumber(scoreData.score || 0)}
                        {scoreData.extraScore && (
                          <span style={{ color: '#ffd700' }}> + {formatNumber(scoreData.extraScore)}</span>
                        )}
                        {scoreData.score && scoreData.extraScore && (
                          <span style={{ color: '#1e90ff' }}> (合计: {formatNumber(parseFloat(scoreData.score || 0) + parseFloat(scoreData.extraScore || 0))})</span>
                        )}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
            <div style={{ flex: '70%', position: 'relative' }}>
              {isLoading && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(24,28,38,0.8)',
                  zIndex: 10,
                }}>
                  <Spin size="small" />
                </div>
              )}
              {hasError && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ff4444',
                  fontSize: '12px',
                }}>
                  {hasError}
                </div>
              )}
              {!hasData && !isLoading && !hasError && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: TEXT_COLOR,
                  fontSize: '12px',
                }}>
                  暂无数据
                </div>
              )}
              <div id={`kline-chart-${gridIndex}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
            <div style={{ flex: '30%', position: 'relative' }}>
              <div id={`volume-chart-${gridIndex}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
          </div>
        );
      });
    } else if (mode === MODE_4_STOCK) {
      const currentStocks = getCurrentStocks4();
      return currentStocks.map((stock, index) => {
        const stockCode = stock?.stockCode;
        const stockData = stockCode ? stocksData[stockCode] : null;
        const isLoading = stockData?.loading;
        const hasError = stockData?.error;
        const hasData = stockData?.chartData && stockData.chartData.length > 0;
        const gridKey = `${stockCode || 'empty'}-${index}`;
        const isSelected = selectedGrid === gridKey;

        return (
          <div
            key={gridKey}
            style={{
              backgroundColor: BG_COLOR,
              border: isSelected ? '2px solid #1e90ff' : '1px solid #23263a',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div 
              style={{
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: TEXT_COLOR,
                borderBottom: '1px solid #23263a',
                backgroundColor: '#23263a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onDoubleClick={() => {
                const newSelected = isSelected ? null : gridKey;
                setSelectedGrid(newSelected);
                // 如果选中了网格，发送选中消息给后端
                if (newSelected && stockCode) {
                  sendSelectStockCode(stockCode);
                }
              }}
              title="双击选中/取消选中此网格"
            >
              <span>{stock?.stockName || '--'} ({stockCode || '--'})</span>
              {showStockInfo && stockCode && (() => {
                const stockDetail = stockDetails[stockCode];
                const latestData = latestStockDataMap[stockCode];
                const scoreData = stockScoresMap[stockCode];
                
                return (
                  <>
                    {stockDetail?.outstandingMarketValue && (
                      <span style={{ color: '#11d1e4', fontSize: '11px' }}>
                        市值: {Number(stockDetail.outstandingMarketValue / 100000000).toFixed(2)}亿
                      </span>
                    )}
                    {latestData && (
                      <>
                        <span style={{ fontSize: '11px' }}>
                          股价: <span style={{
                            color: latestData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestData.closePrice}</span>
                        </span>
                        <span style={{ fontSize: '11px' }}>
                          涨跌幅: <span style={{
                            color: latestData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestData.zhangDieFu >= 0 ? '+' : ''}{formatNumber(latestData.zhangDieFu)}%</span>
                        </span>
                      </>
                    )}
                    {scoreData && (
                      <span style={{ color: '#ffd700', fontSize: '11px' }}>
                        分数: {formatNumber(scoreData.score || 0)}
                        {scoreData.extraScore && (
                          <span style={{ color: '#ffd700' }}> + {formatNumber(scoreData.extraScore)}</span>
                        )}
                        {scoreData.score && scoreData.extraScore && (
                          <span style={{ color: '#1e90ff' }}> (合计: {formatNumber(parseFloat(scoreData.score || 0) + parseFloat(scoreData.extraScore || 0))})</span>
                        )}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
            <div style={{ flex: '70%', position: 'relative' }}>
              {isLoading && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(24,28,38,0.8)',
                  zIndex: 10,
                }}>
                  <Spin size="small" />
                </div>
              )}
              {hasError && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ff4444',
                  fontSize: '12px',
                }}>
                  {hasError}
                </div>
              )}
              {!hasData && !isLoading && !hasError && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: TEXT_COLOR,
                  fontSize: '12px',
                }}>
                  暂无数据
                </div>
              )}
              <div id={`kline-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
            <div style={{ flex: '30%', position: 'relative' }}>
              <div id={`volume-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
          </div>
        );
      });
    } else if (mode === MODE_9_STOCK) {
      const currentStocks = getCurrentStocks9();
      return currentStocks.map((stock, index) => {
        const stockCode = stock?.stockCode;
        const stockData = stockCode ? stocksData[stockCode] : null;
        const isLoading = stockData?.loading;
        const hasError = stockData?.error;
        const hasData = stockData?.chartData && stockData.chartData.length > 0;
        const gridKey = `${stockCode || 'empty'}-${index}`;
        const isSelected = selectedGrid === gridKey;

        return (
          <div
            key={gridKey}
            style={{
              backgroundColor: BG_COLOR,
              border: isSelected ? '2px solid #1e90ff' : '1px solid #23263a',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div 
              style={{
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: TEXT_COLOR,
                borderBottom: '1px solid #23263a',
                backgroundColor: '#23263a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onDoubleClick={() => {
                const newSelected = isSelected ? null : gridKey;
                setSelectedGrid(newSelected);
                // 如果选中了网格，发送选中消息给后端
                if (newSelected && stockCode) {
                  sendSelectStockCode(stockCode);
                }
              }}
              title="双击选中/取消选中此网格"
            >
              <span>{stock?.stockName || '--'} ({stockCode || '--'})</span>
              {showStockInfo && stockCode && (() => {
                const stockDetail = stockDetails[stockCode];
                const latestData = latestStockDataMap[stockCode];
                const scoreData = stockScoresMap[stockCode];
                
                return (
                  <>
                    {stockDetail?.outstandingMarketValue && (
                      <span style={{ color: '#11d1e4', fontSize: '11px' }}>
                        市值: {Number(stockDetail.outstandingMarketValue / 100000000).toFixed(2)}亿
                      </span>
                    )}
                    {latestData && (
                      <>
                        <span style={{ fontSize: '11px' }}>
                          股价: <span style={{
                            color: latestData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestData.closePrice}</span>
                        </span>
                        <span style={{ fontSize: '11px' }}>
                          涨跌幅: <span style={{
                            color: latestData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestData.zhangDieFu >= 0 ? '+' : ''}{formatNumber(latestData.zhangDieFu)}%</span>
                        </span>
                      </>
                    )}
                    {scoreData && (
                      <span style={{ color: '#ffd700', fontSize: '11px' }}>
                        分数: {formatNumber(scoreData.score || 0)}
                        {scoreData.extraScore && (
                          <span style={{ color: '#ffd700' }}> + {formatNumber(scoreData.extraScore)}</span>
                        )}
                        {scoreData.score && scoreData.extraScore && (
                          <span style={{ color: '#1e90ff' }}> (合计: {formatNumber(parseFloat(scoreData.score || 0) + parseFloat(scoreData.extraScore || 0))})</span>
                        )}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
            <div style={{ flex: '70%', position: 'relative' }}>
              {isLoading && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(24,28,38,0.8)',
                  zIndex: 10,
                }}>
                  <Spin size="small" />
                </div>
              )}
              {hasError && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ff4444',
                  fontSize: '12px',
                }}>
                  {hasError}
                </div>
              )}
              {!hasData && !isLoading && !hasError && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: TEXT_COLOR,
                  fontSize: '12px',
                }}>
                  暂无数据
                </div>
              )}
              <div id={`kline-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
            <div style={{ flex: '30%', position: 'relative' }}>
              <div id={`volume-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
            </div>
          </div>
        );
      });
    }
    return null;
  };

  return (
    <div style={{
      padding: 0,
      margin: 0,
      backgroundColor: BG_COLOR,
      color: TEXT_COLOR,
      height: `${windowHeight}px`,
      width: '100vw',
      overflow: 'hidden',
      fontSize: '14px',
    }}>
      {/* 顶部工具栏 */}
      <div style={{
        padding: '8px 20px',
        backgroundColor: BG_COLOR,
        height: `${headerHeight}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid #23263a',
        justifyContent: 'space-between',
      }}>
        {/* 左侧：模式信息和区间选择 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          {mode === MODE_1_STOCK && (
            <>
              <span style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>
                {currentStock?.stockName || '--'} ({currentStock?.stockCode || '--'})
              </span>
              <span style={{ marginLeft: '20px', color: '#888', fontSize: '12px' }}>
                四块区域分别显示：1年、2年、5年、10年K线图
              </span>
              <span style={{ marginLeft: '20px', color: '#888', fontSize: '12px' }}>
                {baseIndex + 1} / {stockList.length} (↑↓切换股票)
              </span>
            </>
          )}
          
          {mode === MODE_2_STOCK && (
            <>
              <span style={{ color: '#fff', fontSize: '12px' }}>上区区间:</span>
              {[0.5, 1, 2, 3, 5, 10, 20].map(y => (
                <button
                  key={`top-${y}`}
                  onClick={() => setRangeYearsTop(y)}
                  style={{
                    minWidth: '25px',
                    padding: '2px 8px',
                    background: '#23263a',
                    color: '#fff',
                    border: rangeYearsTop === y ? '2px solid #1e90ff' : '1px solid #444',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontWeight: rangeYearsTop === y ? 'bold' : 'normal',
                    fontSize: '13px',
                    outline: 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => {
                    if (rangeYearsTop !== y) {
                      e.target.style.background = '#2a2f3a';
                      e.target.style.borderColor = '#1e90ff';
                    }
                  }}
                  onMouseOut={e => {
                    if (rangeYearsTop !== y) {
                      e.target.style.background = '#23263a';
                      e.target.style.borderColor = '#444';
                    }
                  }}
                >
                  {y === 0.5 ? '半年' : y}
                </button>
              ))}
              <span style={{ marginLeft: '20px', color: '#fff', fontSize: '12px' }}>下区区间:</span>
              {[0.5, 1, 2, 3, 5, 10, 20].map(y => (
                <button
                  key={`bottom-${y}`}
                  onClick={() => setRangeYearsBottom(y)}
                  style={{
                    minWidth: '25px',
                    padding: '2px 8px',
                    background: '#23263a',
                    color: '#fff',
                    border: rangeYearsBottom === y ? '2px solid #1e90ff' : '1px solid #444',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontWeight: rangeYearsBottom === y ? 'bold' : 'normal',
                    fontSize: '13px',
                    outline: 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => {
                    if (rangeYearsBottom !== y) {
                      e.target.style.background = '#2a2f3a';
                      e.target.style.borderColor = '#1e90ff';
                    }
                  }}
                  onMouseOut={e => {
                    if (rangeYearsBottom !== y) {
                      e.target.style.background = '#23263a';
                      e.target.style.borderColor = '#444';
                    }
                  }}
                >
                  {y === 0.5 ? '半年' : y}
                </button>
              ))}
              <span style={{ marginLeft: '20px', color: '#fff', fontSize: '12px' }}>
                {baseIndex + 1}-{Math.min(baseIndex + 2, stockList.length)} / {stockList.length}
              </span>
            </>
          )}
          
          {mode === MODE_4_STOCK && (
            <>
              <span style={{ color: '#fff', fontSize: '12px' }}>区间:</span>
              {[0.5, 1, 2, 3, 5, 10, 20].map(y => (
                <button
                  key={y}
                  onClick={() => setRangeYears(y)}
                  style={{
                    minWidth: '25px',
                    padding: '2px 8px',
                    background: '#23263a',
                    color: '#fff',
                    border: rangeYears === y ? '2px solid #1e90ff' : '1px solid #444',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontWeight: rangeYears === y ? 'bold' : 'normal',
                    fontSize: '13px',
                    outline: 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => {
                    if (rangeYears !== y) {
                      e.target.style.background = '#2a2f3a';
                      e.target.style.borderColor = '#1e90ff';
                    }
                  }}
                  onMouseOut={e => {
                    if (rangeYears !== y) {
                      e.target.style.background = '#23263a';
                      e.target.style.borderColor = '#444';
                    }
                  }}
                >
                  {y === 0.5 ? '半年' : y}
                </button>
              ))}
              <span style={{ marginLeft: '20px', color: '#fff', fontSize: '12px' }}>
                {baseIndex + 1}-{Math.min(baseIndex + GRID_COUNT_4, stockList.length)} / {stockList.length}
              </span>
            </>
          )}
          
          {mode === MODE_9_STOCK && (
            <>
              <span style={{ color: '#fff', fontSize: '12px' }}>区间:</span>
              {[0.5, 1, 2, 3, 5, 10, 20].map(y => (
                <button
                  key={y}
                  onClick={() => setRangeYears9(y)}
                  style={{
                    minWidth: '25px',
                    padding: '2px 8px',
                    background: '#23263a',
                    color: '#fff',
                    border: rangeYears9 === y ? '2px solid #1e90ff' : '1px solid #444',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontWeight: rangeYears9 === y ? 'bold' : 'normal',
                    fontSize: '13px',
                    outline: 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => {
                    if (rangeYears9 !== y) {
                      e.target.style.background = '#2a2f3a';
                      e.target.style.borderColor = '#1e90ff';
                    }
                  }}
                  onMouseOut={e => {
                    if (rangeYears9 !== y) {
                      e.target.style.background = '#23263a';
                      e.target.style.borderColor = '#444';
                    }
                  }}
                >
                  {y === 0.5 ? '半年' : y}
                </button>
              ))}
              <span style={{ marginLeft: '20px', color: '#fff', fontSize: '12px' }}>
                {baseIndex + 1}-{Math.min(baseIndex + GRID_COUNT_9, stockList.length)} / {stockList.length}
              </span>
            </>
          )}
        </div>

        {/* 右侧：模式切换按钮和显示开关 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setShowStockInfo(!showStockInfo)}
            style={{
              padding: '2px 8px',
              background: showStockInfo ? '#1e90ff' : '#23263a',
              color: '#fff',
              border: showStockInfo ? '2px solid #1e90ff' : '1px solid #444',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '12px',
              outline: 'none',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => {
              if (!showStockInfo) {
                e.target.style.background = '#2a2f3a';
                e.target.style.borderColor = '#1e90ff';
              }
            }}
            onMouseOut={e => {
              if (!showStockInfo) {
                e.target.style.background = '#23263a';
                e.target.style.borderColor = '#444';
              }
            }}
            title="显示/隐藏股票详细信息（市值、股价、涨跌幅、分数）"
          >
            {showStockInfo ? '隐藏信息' : '显示信息'}
          </button>
          <span style={{ color: '#888', fontSize: '12px', marginRight: 4 }}>模式:</span>
          <button
            onClick={() => setMode(MODE_1_STOCK)}
            style={{
              padding: '4px',
              background: mode === MODE_1_STOCK ? '#1e90ff' : '#23263a',
              border: mode === MODE_1_STOCK ? '2px solid #1e90ff' : '1px solid #444',
              borderRadius: '4px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
            }}
            onMouseOver={e => {
              if (mode !== MODE_1_STOCK) {
                e.currentTarget.style.background = '#2a2f3a';
                e.currentTarget.style.borderColor = '#1e90ff';
              }
            }}
            onMouseOut={e => {
              if (mode !== MODE_1_STOCK) {
                e.currentTarget.style.background = '#23263a';
                e.currentTarget.style.borderColor = '#444';
              }
            }}
            title="1支股票，四块区域分别显示1年、2年、5年、10年K线图"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="14" height="14" rx="1.5" stroke={mode === MODE_1_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
            </svg>
          </button>
          <button
            onClick={() => setMode(MODE_2_STOCK)}
            style={{
              padding: '4px',
              background: mode === MODE_2_STOCK ? '#1e90ff' : '#23263a',
              border: mode === MODE_2_STOCK ? '2px solid #1e90ff' : '1px solid #444',
              borderRadius: '4px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
            }}
            onMouseOver={e => {
              if (mode !== MODE_2_STOCK) {
                e.currentTarget.style.background = '#2a2f3a';
                e.currentTarget.style.borderColor = '#1e90ff';
              }
            }}
            onMouseOut={e => {
              if (mode !== MODE_2_STOCK) {
                e.currentTarget.style.background = '#23263a';
                e.currentTarget.style.borderColor = '#444';
              }
            }}
            title="2支股票网格对比查看"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="6.5" height="14" rx="1.5" stroke={mode === MODE_2_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="9.5" y="2" width="6.5" height="14" rx="1.5" stroke={mode === MODE_2_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
            </svg>
          </button>
          <button
            onClick={() => setMode(MODE_4_STOCK)}
            style={{
              padding: '4px',
              background: mode === MODE_4_STOCK ? '#1e90ff' : '#23263a',
              border: mode === MODE_4_STOCK ? '2px solid #1e90ff' : '1px solid #444',
              borderRadius: '4px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
            }}
            onMouseOver={e => {
              if (mode !== MODE_4_STOCK) {
                e.currentTarget.style.background = '#2a2f3a';
                e.currentTarget.style.borderColor = '#1e90ff';
              }
            }}
            onMouseOut={e => {
              if (mode !== MODE_4_STOCK) {
                e.currentTarget.style.background = '#23263a';
                e.currentTarget.style.borderColor = '#444';
              }
            }}
            title="4支股票网格对比查看"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="6" height="6" rx="1" stroke={mode === MODE_4_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="10" y="2" width="6" height="6" rx="1" stroke={mode === MODE_4_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="2" y="10" width="6" height="6" rx="1" stroke={mode === MODE_4_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="10" y="10" width="6" height="6" rx="1" stroke={mode === MODE_4_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
            </svg>
          </button>
          <button
            onClick={() => setMode(MODE_9_STOCK)}
            style={{
              padding: '4px',
              background: mode === MODE_9_STOCK ? '#1e90ff' : '#23263a',
              border: mode === MODE_9_STOCK ? '2px solid #1e90ff' : '1px solid #444',
              borderRadius: '4px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
            }}
            onMouseOver={e => {
              if (mode !== MODE_9_STOCK) {
                e.currentTarget.style.background = '#2a2f3a';
                e.currentTarget.style.borderColor = '#1e90ff';
              }
            }}
            onMouseOut={e => {
              if (mode !== MODE_9_STOCK) {
                e.currentTarget.style.background = '#23263a';
                e.currentTarget.style.borderColor = '#444';
              }
            }}
            title="9支股票网格对比查看"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="6" y="1" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="11" y="1" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="1" y="6" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="6" y="6" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="11" y="6" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="1" y="11" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="6" y="11" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
              <rect x="11" y="11" width="4" height="4" rx="0.5" stroke={mode === MODE_9_STOCK ? '#fff' : '#888'} strokeWidth="1.5" fill="none"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 网格容器 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${mode === MODE_9_STOCK ? GRID_COLS_9 : GRID_COLS_4}, 1fr)`,
        gridTemplateRows: `repeat(${mode === MODE_9_STOCK ? GRID_ROWS_9 : GRID_ROWS_4}, 1fr)`,
        gap: '4px',
        padding: '4px',
        height: `${windowHeight - headerHeight}px`,
        width: '100%',
      }}>
        {renderGridContent()}
      </div>
    </div>
  );
};

export default StockDetailGrid;