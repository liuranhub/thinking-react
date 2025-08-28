import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import * as echarts from 'echarts';
import { calcStockStats, incrementalDecline, calcScore } from '../utils/calcVolatility';
import { message, Select, Spin, Rate, Tooltip } from 'antd';
import 'antd/dist/reset.css';
import '../App.css';
import { pinyin } from 'pinyin-pro';
import { API_HOST } from '../config/config';

const MA_CONFIG = [
    { key: 5, label: 'MA5', color: '#e4c441', default: false },
    { key: 10, label: 'MA10', color: '#ff00ff', default: false },
    { key: 20, label: 'MA20', color: '#11d1e4', default: false },
    { key: 30, label: 'MA30', color: '#23b14d', default: false },
    { key: 60, label: 'MA60', color: '#bdbdbd', default: false },
    { key: 120, label: 'MA120', color: '#1e90ff', default: true },
    { key: 250, label: 'MA250', color: '#ffd700', default: false },
  ];

const BG_COLOR = '#181c26';
const AXIS_COLOR = '#888ca0';
const TEXT_COLOR = '#fff';
const RED = '#ef232a';
const GREEN = '#14b143';

let chartGroupId = 'stock-detail-group';

function getDateNDaysAgo(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const StockDetail = () => {
  const location = useLocation();
  const { stockCode: paramStockCode } = useParams();
  // 股票列表
  const [stockList, setStockList] = useState(location.state?.stockList || []);
  // 当前索引
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = (location.state?.stockList || []).findIndex(s => s.stockCode === paramStockCode);
    return idx >= 0 ? idx : 0;
  });
  // 当前股票
  const currentStock = stockList[currentIndex] || {};
  const stockCode = currentStock.stockCode;
  // 全量数据
  const [allStockData, setAllStockData] = useState([]);
  // 当前区间数据
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMAs, setSelectedMAs] = useState(MA_CONFIG.filter(ma => ma.default).map(ma => ma.key));
  // 区间选择：最近N年
  const [rangeYears, setRangeYears] = useState(5); // 默认5年
  const [chartEndDate, setChartEndDate] = useState('');
  const chartEndDateRef = useRef(chartEndDate);
  const debouncedSetChartEndDate = useRef(debounce((date) => setChartEndDate(date), 200)).current;
  // 新增：截止期日历史栈
  const chartEndDateHistory = useRef([]);
  const [stockDetail, setStockDetail] = useState({});
  const [yaoGu, setYaoGu] = useState(false);
  const [magnifier, setMagnifier] = useState({ visible: false, x: 0, y: 0, idx: null });
  const ctrlDownTime = useRef(0);
  const mouseInKline = useRef(false);
  // 新增：记录鼠标在k线图上的最新位置
  const lastMousePositionRef = useRef({ x: 0, y: 0 });
  // 新增：放大镜功能激活状态
  const [isMagnifierActive, setIsMagnifierActive] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteStars, setFavoriteStars] = useState(3);
  const [originalData, setOriginalData] = useState([]); // 保存原始K线数据
  const [apiScoreResult, setApiScoreResult] = useState({}); // API分数结果

    // 高亮标签关键词配置
  const HIGHLIGHT_TAG_CONFIG = [
    { tagName: '国企', color: '#1ecb8c' },    // 明亮青绿
    { tagName: '军工', color: '#ff6b81' },    // 柔和珊瑚红
    { tagName: '华为', color: '#1e90ff' },    // 亮蓝
    { tagName: '新能源', color: '#ffd700' },  // 金黄
    { tagName: '独角兽', color: '#a259ff' },  // 紫色
    { tagName: '芯片', color: '#ffb86c' },    // 橙黄
    { tagName: '低空经济', color: '#23b14d' },    // 绿色
    { tagName: '无人机', color: '#f672ff' },    // 粉紫
    // { tagName: '中字头', color: '#00bcd4' },  // 青色
    // { tagName: '高股息', color: '#ff9800' },  // 橙色
  ];

  // 键盘上下键切换股票（循环）
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!stockList.length) return;
      if (e.key === 'ArrowUp') {
        setCurrentIndex(idx => (idx > 0 ? idx - 1 : stockList.length - 1));
      }
      if (e.key === 'ArrowDown') {
        setCurrentIndex(idx => (idx < stockList.length - 1 ? idx + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stockList]);

  // 鼠标滚轮切换股票，屏蔽K线图缩放
  useEffect(() => {
    const klineDom = document.getElementById('kline-chart');
    if (!klineDom) return;
    const handleWheel = (e) => {
      // 阻止ECharts缩放
      e.preventDefault();
      if (!stockList.length) return;
      if (e.deltaY < 0) {
        // 向上滚轮，上一只
        setCurrentIndex(idx => (idx > 0 ? idx - 1 : stockList.length - 1));
      } else if (e.deltaY > 0) {
        // 向下滚轮，下一只
        setCurrentIndex(idx => (idx < stockList.length - 1 ? idx + 1 : 0));
      }
    };
    klineDom.addEventListener('wheel', handleWheel, { passive: false });
    return () => klineDom.removeEventListener('wheel', handleWheel);
  }, [stockList]);

  // stockList丢失时跳回首页
  useEffect(() => {
    if (!stockList.length) {
      alert('请从股票列表进入详情页');
      window.location.href = '/';
    }
  }, [stockList]);

  // 拉取当前股票数据
  useEffect(() => {
    if (!stockCode) return;
    fetchStockData();
    // eslint-disable-next-line
  }, [stockCode]);

  // fetchStockData后自动重置结束日期为最新
  useEffect(() => {
    setChartEndDate(currentStock.date);
    chartEndDateHistory.current = [];
  }, [currentStock]);

  // 计算区间（最近N年）并筛选数据
  useEffect(() => {
    if (allStockData.length > 0) {
      const allDates = allStockData.map(item => item.date);
      const maxDate = chartEndDate || allDates[allDates.length - 1];
      const minDate = allDates[0];
      const startDate = getDateNDaysAgo(maxDate, rangeYears);
      const chartStartDate = startDate < minDate ? minDate : startDate;
      const filtered = allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
      console.log(maxDate)
      console.log(filtered)
      setChartData(filtered);
    }
  }, [allStockData, rangeYears, chartEndDate]);

  // 渲染图表
  useEffect(() => {
    if (chartData.length > 0) {
      return renderCharts();
    }
  }, [chartData, selectedMAs]);

  // 获取API分数
  const fetchApiScore = async () => {
    if (!stockCode || !chartEndDate) return;
    
    try {
      const response = await fetch(API_HOST + `/stock/stockScoreAnalyser/${stockCode}/${chartEndDate}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setApiScoreResult(data);
      } else {
        setApiScoreResult({});
      }
    } catch (error) {
      console.error('获取接口总分失败:', error);
      setApiScoreResult({});
    }
  };

  // 当股票代码或结束日期变化时获取API分数
  useEffect(() => {
    fetchApiScore();
  }, [stockCode, chartEndDate]);

  // 拉取当前股票详情，获取yaoGu等
  const fetchDetail = async () => {
    if (!stockCode) return;
    try {
      const resp = await fetch(API_HOST + `/stock/stockDetail/${stockCode}`);
      if (resp.ok) {
        const detail = await resp.json();
        setStockDetail(detail);
        setYaoGu(!!detail.yaoGu);
        setIsFavorite(!!detail.favorite); // 新增收藏状态
        setFavoriteStars(detail.favoriteStar || 0); // 新增星级
      } else {
        setStockDetail({});
        setYaoGu(false);
        setIsFavorite(false);
        setFavoriteStars(0);
      }
    } catch {
      setStockDetail({});
      setYaoGu(false);
      setIsFavorite(false);
      setFavoriteStars(0);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line
  }, [stockCode, currentStock]);

  const fetchStockData = async () => {
    try {
      setLoading(true);
      
 
      const warmUpStockCodes = getWarmUpStockCodes();
      
      // 构建URL参数
      const url = new URL(API_HOST + `/stock/stockDetail/dayKLine/${stockCode}/compress`);
      if (warmUpStockCodes.length > 0) {
        // 将数组转换为URL参数格式
        warmUpStockCodes.forEach(code => {
          url.searchParams.append('warmUpStockCodes', code);
        });
      }
      
      const response = await fetch(url.toString(), {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('网络请求失败');
      }
      const data = await response.json();
      // 解析紧凑数据格式：日期、OpenPrice、ClosePrice、MinPrice、MaxPrice、ChenJiaoLiang、ZhangDieFu
      const parsedData = data.map(item => {
        const [date, openPrice, closePrice, minPrice, maxPrice, chenJiaoLiang, zhangDieFu] = item.split(',');
        return {
          date,
          openPrice: parseFloat(openPrice),
          closePrice: parseFloat(closePrice),
          minPrice: parseFloat(minPrice),
          maxPrice: parseFloat(maxPrice),
          chenJiaoLiang: parseFloat(chenJiaoLiang),
          zhangDieFu: parseFloat(zhangDieFu)
        };
      });
      const sorted = parsedData.slice().sort((a, b) => a.date.localeCompare(b.date));
      setAllStockData(sorted);
      setOriginalData(sorted); // 保存原始数据
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

// 获取当前股票前后10条股票的code作为预热参数
const getWarmUpStockCodes = () => {
  if (!stockList.length) return [];
  
  const currentIdx = currentIndex;
  const warmUpCodes = [];
  
  // 获取前10条
  for (let i = Math.max(0, currentIdx - 10); i < currentIdx; i++) {
    if (stockList[i]?.stockCode) {
      warmUpCodes.push(stockList[i].stockCode);
    }
  }
  
  // 获取后10条
  for (let i = currentIdx + 1; i < Math.min(stockList.length, currentIdx + 11); i++) {
    if (stockList[i]?.stockCode) {
      warmUpCodes.push(stockList[i].stockCode);
    }
  }
  
  return warmUpCodes;
};




  // 生成未来30天模拟上涨数据
  function generateSimulatedUpData(lastData, days = 15) {
    const simulated = [];
    let price = lastData.closePrice;
    let currentDate = new Date(lastData.date);
    for (let i = 1; i <= days; i++) {
      const up = 0.10; // 每天上涨10%
      price = price * (1 + up);
      currentDate.setDate(currentDate.getDate() + 1);
      const dateStr = currentDate.toISOString().slice(0, 10);
      simulated.push({
        ...lastData,
        date: dateStr,
        openPrice: Number((price / (1 + up)).toFixed(2)),
        closePrice: Number(price.toFixed(2)),
        minPrice: Number((price * 0.97).toFixed(2)),
        maxPrice: Number((price * 1.03).toFixed(2)),
        chenJiaoLiang: Math.round(lastData.chenJiaoLiang * (5 + Math.random() * 5)),
        zhangDieFu: 10.00,
      });
    }
    return simulated;
  }

  // 生成未来days天模拟横盘数据（股价在lastData附近小幅波动）
  function generateSimulatedFlatData(lastData, days = 15) {
    const simulated = [];
    let price = lastData.closePrice;
    let currentDate = new Date(lastData.date);
    for (let i = 1; i <= days; i++) {
      // 涨跌幅在-10%~+10%之间
      const up = (Math.random() * 0.1) - 0.05;
      price = price * (1 + up);
      currentDate.setDate(currentDate.getDate() + 1);
      const dateStr = currentDate.toISOString().slice(0, 10);
      simulated.push({
        ...lastData,
        date: dateStr,
        openPrice: Number(price.toFixed(2)),
        closePrice: Number(price.toFixed(2)),
        minPrice: Number((price * (1 - Math.random() * 0.05)).toFixed(2)),
        maxPrice: Number((price * (1 + Math.random() * 0.05)).toFixed(2)),
        chenJiaoLiang: Math.round(lastData.chenJiaoLiang * (1 + Math.random() * 0.2 - 0.1)),
        zhangDieFu: Number((up * 100).toFixed(2)),
      });
    }
    return simulated;
  }

  // 模拟上涨按钮事件
  const handleSimulateUp = () => {
    if (!allStockData.length) return;
    const last = originalData[originalData.length - 1];
    const simulated = generateSimulatedUpData(last, 15);
    const newStockData = [...originalData, ...simulated, ...generateSimulatedFlatData(simulated[simulated.length - 1])];
    chartEndDateHistory.current.push(chartEndDateRef.current);
    setChartEndDate(newStockData[newStockData.length - 1].date);
    setAllStockData(newStockData);
  };

  // 重置按钮事件
  const handleReset = () => {
    setAllStockData(originalData);
    chartEndDateHistory.current.push(chartEndDateRef.current);
    setChartEndDate(currentStock.date);
    setRangeYears(10);
  };

  // 后退按钮事件
  const handleBackChartEndDate = () => {
    if (chartEndDateHistory.current.length > 0) {
      const prev = chartEndDateHistory.current.pop();
      if (prev) setChartEndDate(prev);
    }
  };

  // 保持chartEndDateRef同步
  useEffect(() => {
    chartEndDateRef.current = chartEndDate;
  }, [chartEndDate]);

  const renderCharts = () => {
    // DOM检查，防止ECharts初始化报错
    const klineDom = document.getElementById('kline-chart');
    const volumeDom = document.getElementById('volume-chart');
    if (!klineDom || !volumeDom) return;
    // 只展示区间内数据，但MA计算用全量数据
    const allDates = allStockData.map(item => item.date);
    const chartDates = chartData.map(item => item.date);
    const chartStartIdx = allDates.indexOf(chartDates[0]);
    const chartEndIdx = allDates.indexOf(chartDates[chartDates.length - 1]);
    // 区间内K线和成交量
    const klineData = allStockData.slice(chartStartIdx, chartEndIdx + 1).map(item => [
      item.openPrice,
      item.closePrice,
      item.minPrice,
      item.maxPrice
    ]);
    const volumeData = allStockData.slice(chartStartIdx, chartEndIdx + 1).map(item => item.chenJiaoLiang);
    // MA均线（全量数据计算，区间内显示）
    function calcMA(dayCount) {
      const result = [];
      for (let i = 0; i < allStockData.length; i++) {
        if (i < dayCount - 1) {
          result.push('-');
          continue;
        }
        let sum = 0;
        for (let j = 0; j < dayCount; j++) {
          sum += allStockData[i - j].closePrice;
        }
        result.push((sum / dayCount).toFixed(2));
      }
      // 只取区间内部分
      return result.slice(chartStartIdx, chartEndIdx + 1);
    }
    const maList = MA_CONFIG.filter(ma => selectedMAs.includes(ma.key)).map(ma => ({
      ...ma,
      data: calcMA(ma.key)
    }));
    const dates = chartDates;
    const dataZoom = [
      {
        id: 'stock-zoom',
        type: 'inside',
        start: 0,
        end: 100,
        minValueSpan: 10,
        zoomOnMouseWheel: false, // 禁用滚轮缩放
        moveOnMouseWheel: false,
        moveOnMouseMove: true,
        throttle: 50
      }
    ];
    // K线图
    const klineChart = echarts.init(document.getElementById('kline-chart'));
    klineChart.group = chartGroupId;
    const klineOption = {
      backgroundColor: BG_COLOR,
      title: {
        // text: `${chartData[0]?.stockName || '股票'} (${stockCode}) 日K线图`,
        left: 'center',
        top: '10px',
        textStyle: { fontSize: 16, fontWeight: 'bold', color: TEXT_COLOR }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: '#444',
            width: 1.2,
            type: 'dashed',
          },
          crossStyle: {
            color: '#444',
            width: 1.2,
          },
          label: {
            backgroundColor: '#23263a',
            color: '#fff',
            borderColor: '#444',
            borderWidth: 1,
          }
        },
        backgroundColor: 'rgba(24,28,38,0.95)',
        borderColor: '#333',
        textStyle: { color: TEXT_COLOR },
        formatter: function (params) {
          const data = params[0].data;
          // 获取当前数据点的zhenFu字段
          const currentIndex = params[0].dataIndex;
          const currentData = chartData[currentIndex];
          const zhangDieFu = currentData?.zhangDieFu ?? 0;
          const zhangDieFuColor = zhangDieFu >= 0 ? '#ef232a' : '#14b143'; // 红涨绿跌
          
        //   return `
        //     <div style="color: #fff;">
        //       <div>日期: ${params[0].axisValue}</div>
        //       <div>开盘: ${currentData.openPrice}</div>
        //       <div>收盘: ${currentData.closePrice}</div>
        //       <div>最低: ${currentData.minPrice}</div>
        //       <div>最高: ${currentData.maxPrice}</div>
        //       <div>涨跌幅: <span style="color:${zhangDieFuColor};font-weight:bold">${Number(zhangDieFu).toFixed(2)}%</span></div>
        //     </div>
        //   `;
          return `
              涨跌幅: <span style="color:${zhangDieFuColor};font-weight:bold">${Number(zhangDieFu).toFixed(2)}%</span>
          `;
        }
      },
      grid: { left: '5%', right: '5%', top: '15%', bottom: '5%' },
      xAxis: {
        type: 'category',
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLine: { onZero: false, lineStyle: { color: AXIS_COLOR } },
        // 屏蔽刻度线
        axisTick: { show: false }, 
        axisLabel: {
          color: TEXT_COLOR,
          interval: 0,
          formatter: function (value, idx) {
            if (idx === 0) return value.slice(0, 4);
            const prevYear = dates[idx - 1]?.slice(0, 4);
            const currYear = value.slice(0, 4);
            return prevYear !== currYear ? currYear : '';
          }
        },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
      yAxis: {
        scale: true,
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisLabel: { color: TEXT_COLOR },
        splitLine: { lineStyle: { color: '#23263a' } },
        splitArea: { show: false }
      },
      dataZoom,
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: klineData,
          itemStyle: {
            color: RED,
            color0: GREEN,
            borderColor: RED,
            borderColor0: GREEN
          }
        },
        ...maList.map(ma => ({
          name: ma.label,
          type: 'line',
          data: ma.data,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1.5, color: ma.color },
          emphasis: { lineStyle: { width: 2 } },
        }))
      ]
    };
    klineChart.setOption(klineOption);
    // 鼠标双击K线图，立即设置结束日期
    klineChart.getZr().on('dblclick', function (params) {
      const pointInGrid = klineChart.convertFromPixel({gridIndex: 0}, [params.offsetX, params.offsetY]);
      const xIndex = Math.round(pointInGrid[0]);
      if (dates[xIndex]) {
        // 记录历史
        chartEndDateHistory.current.push(chartEndDateRef.current);
        setChartEndDate(dates[xIndex]);
      }
    });
    // 成交量图
    const volumeChart = echarts.init(document.getElementById('volume-chart'));
    volumeChart.group = chartGroupId;
    const volumeOption = {
      backgroundColor: BG_COLOR,
      title: {
        // text: '日交易量',
        left: 'center',
        top: '10px',
        textStyle: { fontSize: 14, fontWeight: 'bold', color: TEXT_COLOR }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: '#444',
            width: 1.2,
            type: 'dashed',
          },
          crossStyle: {
            color: '#444',
            width: 1.2,
          },
          label: {
            backgroundColor: '#23263a',
            color: '#fff',
            borderColor: '#444',
            borderWidth: 1,
          }
        },
        backgroundColor: 'rgba(24,28,38,0.95)',
        borderColor: '#333',
        textStyle: { color: TEXT_COLOR },
        formatter: function (params) {
        //   return `
        //     <div style=\"color: #fff;\">
        //       <div>日期: ${params[0].axisValue}</div>
        //       <div>成交量: ${params[0].value.toLocaleString()}</div>
        //     </div>
        //   `;
        }
      },
      grid: { left: '5%', right: '5%', top: '5%', bottom: '20%' },
      xAxis: {
        type: 'category',
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLine: { onZero: false, lineStyle: { color: AXIS_COLOR } },
        // 屏蔽刻度线
        axisTick: { show: false }, 
        axisLabel: {
          color: TEXT_COLOR,
          interval: 0,
          formatter: function (value, idx) {
            if (idx === 0) return value.slice(0, 4);
            const prevYear = dates[idx - 1]?.slice(0, 4);
            const currYear = value.slice(0, 4);
            return prevYear !== currYear ? currYear : '';
          }
        },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
      yAxis: {
        scale: true,
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisLabel: { color: TEXT_COLOR },
        splitLine: { lineStyle: { color: '#23263a' } },
        splitArea: { show: false }
      },
      dataZoom,
      series: [
        {
          name: '成交量',
          type: 'bar',
          data: volumeData,
          itemStyle: {
            color: function(params) {
              const d = chartData[params.dataIndex];
              return d.closePrice >= d.openPrice ? RED : GREEN;
            }
          }
        }
      ]
    };
    volumeChart.setOption(volumeOption);
    echarts.connect(chartGroupId);
    const handleResize = () => {
      klineChart.resize();
      volumeChart.resize();
    };
    window.addEventListener('resize', handleResize);
    klineChart.on('axisPointerUpdate', function (params) {
      if (params.axesInfo && params.axesInfo.length > 0) {
        const axisValue = params.axesInfo[0].value;
        if (axisValue && axisValue !== chartEndDateRef.current) {
          debouncedSetChartEndDate(axisValue);
        }
      }
    });
    // 绑定wheel事件到canvas
    const chartCanvas = klineChart.getDom().querySelector('canvas');
    if (chartCanvas) {
      chartCanvas.addEventListener('wheel', handleKlineWheel, { passive: false });
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      klineChart.dispose();
      volumeChart.dispose();
      echarts.disconnect(chartGroupId);
      if (chartCanvas) {
        chartCanvas.removeEventListener('wheel', handleKlineWheel);
      }
    };
  };

  // 鼠标滚轮切换股票，屏蔽K线图缩放
  const handleKlineWheel = (e) => {
    // 只处理主要为上下滚动的情况，忽略左右滑动
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) {
      // 左右滑动，忽略
      return;
    }
    // 只允许滚动幅度较大的事件切换，防止触摸板和误触
    if (e.deltaY > -100 && e.deltaY < 100) {
      return;
    }
    e.preventDefault();
    if (!stockList.length) return;
    if (e.deltaY < 0) {
      setCurrentIndex(idx => (idx > 0 ? idx - 1 : stockList.length - 1));
    } else if (e.deltaY > 0) {
      setCurrentIndex(idx => (idx < stockList.length - 1 ? idx + 1 : 0));
    }
  };

  // 放大镜事件监听
  useEffect(() => {
    const klineDom = document.getElementById('kline-chart');
    if (!klineDom) return;
    // 鼠标移动
    const handleMouseMove = (e) => {
      mouseInKline.current = true;
      // 记录鼠标在k线图上的最新位置
      const rect = klineDom.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      lastMousePositionRef.current = { x, y };
      if (!isMagnifierActive) {
        setMagnifier(m => ({ ...m, visible: false }));
        return;
      }
      // 获取ECharts实例和当前x轴索引
      const chart = echarts.getInstanceByDom(klineDom);
      if (!chart) return;
      const pointInGrid = chart.convertFromPixel({gridIndex: 0}, [x, y]);
      const idx = Math.round(pointInGrid[0]);
      if (idx < 0 || idx >= chartData.length) {
        setMagnifier(m => ({ ...m, visible: false }));
        return;
      }
      setMagnifier({ visible: true, x: e.clientX, y: e.clientY, idx });
    };
    // 鼠标离开
    const handleMouseLeave = () => {
      mouseInKline.current = false;
      setMagnifier(m => ({ ...m, visible: false }));
    };
    // Ctrl键监听
    const handleKeyDown = (e) => {
      if (e.key === 'Control') {
        ctrlDownTime.current = Date.now();
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === 'Control') {
        const duration = Date.now() - ctrlDownTime.current;
        if (duration < 300) {
          // 短按Ctrl，关闭放大镜功能
          setIsMagnifierActive(false);
          setMagnifier(m => ({ ...m, visible: false }));
        } else {
          // 长按Ctrl，激活放大镜功能
          setIsMagnifierActive(true);
          // 立即用当前鼠标位置显示放大镜
          if (mouseInKline.current) {
            const { x, y } = lastMousePositionRef.current;
            const chart = echarts.getInstanceByDom(klineDom);
            if (chart) {
              const pointInGrid = chart.convertFromPixel({gridIndex: 0}, [x, y]);
              const idx = Math.round(pointInGrid[0]);
              if (idx >= 0 && idx < chartData.length) {
                setMagnifier({ visible: true, x: x + klineDom.getBoundingClientRect().left, y: y + klineDom.getBoundingClientRect().top, idx });
              }
            }
          }
        }
      }
    };
    klineDom.addEventListener('mousemove', handleMouseMove);
    klineDom.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      klineDom.removeEventListener('mousemove', handleMouseMove);
      klineDom.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [chartData, magnifier.idx, isMagnifierActive]);

  // 渲染放大镜K线图
  useEffect(() => {
    if (!magnifier.visible || magnifier.idx == null) return;
    const magDom = document.getElementById('magnifier-kline');
    if (!magDom) return;
    // 取6个月区间（假设每月20个交易日，取120天）
    const N = 120; // 6个月
    const center = magnifier.idx;
    let start = center;
    let end = Math.min(chartData.length - 1, center + N - 1);
    if (end - start + 1 < N) {
      // 右侧不足N条，向左补足
      start = Math.max(0, end - N + 1);
    }
    const magData = chartData.slice(start, end + 1);
    if (!magData.length) return;
    const magDates = magData.map(d => d.date);
    const magKline = magData.map(d => [d.openPrice, d.closePrice, d.minPrice, d.maxPrice]);
    const magChart = echarts.init(magDom);
    magChart.setOption({
      backgroundColor: BG_COLOR,
      grid: { left: 30, right: 10, top: 20, bottom: 20 },
      xAxis: {
        type: 'category',
        data: magDates,
        axisLabel: { color: TEXT_COLOR, fontSize: 10 },
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        splitLine: { show: false }
      },
      yAxis: {
        scale: true,
        axisLabel: { color: TEXT_COLOR, fontSize: 10 },
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        splitLine: { lineStyle: { color: '#23263a' } }
      },
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: magKline,
          itemStyle: {
            color: RED,
            color0: GREEN,
            borderColor: RED,
            borderColor0: GREEN
          }
        }
      ]
    });
    return () => magChart.dispose();
  }, [magnifier, chartData]);

  // 放大镜弹窗尺寸
  const magnifierWidth = 510 * 1.25; // 637.5
  const magnifierHeight = 270 * 1.25; // 337.5
  // 放大镜弹窗top边界判断
  let popupTop = magnifier.y - magnifierHeight;
  if (popupTop < 0) popupTop = 0;
  if (popupTop + magnifierHeight > window.innerHeight) {
    popupTop = window.innerHeight - magnifierHeight - 100;
  }

  // 放大镜区间日期
  let magStartDate = '';
  let magEndDate = '';
  if (magnifier.visible && magnifier.idx != null && chartData.length > 0) {
    const N = 120;
    let center = magnifier.idx;
    let start = center;
    let end = Math.min(chartData.length - 1, center + N - 1);
    if (end - start + 1 < N) {
      start = Math.max(0, end - N + 1);
    }
    magStartDate = chartData[start]?.date || '';
    magEndDate = chartData[end]?.date || '';
  }

  // 计算放大镜区间的长阳线数量和跌停次数，调用calcStockStats
  let magLongBullCount = 0;
  let magDownLimitCount = 0;
  if (magnifier.visible && magnifier.idx != null && chartData.length > 0) {
    const N = 120;
    let center = magnifier.idx;
    let start = center;
    let end = Math.min(chartData.length - 1, center + N - 1);
    if (end - start + 1 < N) {
      start = Math.max(0, end - N + 1);
    }
    const magData = chartData.slice(start, end + 1);
    const magStats = calcStockStats(magData);
    magLongBullCount = magStats.longBullCount;
    magDownLimitCount = magStats.downLimitCount;
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        backgroundColor: BG_COLOR,
        color: TEXT_COLOR
      }}>
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#ff4444',
        backgroundColor: BG_COLOR
      }}>
        错误: {error}
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        backgroundColor: BG_COLOR,
        color: TEXT_COLOR
      }}>
        暂无数据
      </div>
    );
  }

  // 年区间按钮
  const handleRangeChange = (years) => {
    setRangeYears(years);
  };

  const stockStats = calcStockStats(chartData);
  const declineResult = incrementalDecline(chartData);

  // 添加为妖股
  const handleAddYaogu = async () => {
    const stockName = chartData[0]?.stockName || currentStock.stockName || '';
    const date = chartEndDate;
    try {
      const resp = await fetch(API_HOST + '/stock/addYaogu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockCode, stockName, date })
      });
      if (resp.ok) {
        message.success('添加为妖股成功！', 2);
        await fetchDetail();
      } else {
        message.error('添加失败', 2);
      }
    } catch (e) {
      message.error('网络错误，添加失败', 2);
    }
  };

  // 取消妖股
  const handleRemoveYaogu = async () => {
    try {
      const resp = await fetch(API_HOST + `/stock/removeYaogu/${stockCode}`, { method: 'DELETE' });
      if (resp.ok) {
        message.success('取消妖股成功！', 2);
        await fetchDetail();
      } else {
        message.error('取消失败', 2);
      }
    } catch (e) {
      message.error('网络错误，取消失败', 2);
    }
  };

  // 通用添加收藏方法
  const stockFavorite = async (star = 3) => {
    try {
      if(star === 0) {
        await fetch(API_HOST + `/stock/removeFavorite/${stockCode}`, { method: 'POST' });
        message.success('取消收藏成功！', 2);
      } else {
        await fetch(API_HOST + '/stock/addFavorite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stockCode, favoriteStar: star })
          });
          message.success('添加收藏成功！', 2);
      }
      setIsFavorite(true);
      setFavoriteStars(star);
    } catch {
      message.error('添加收藏失败', 2);
    }
  };

  // 格式化数值函数
  const formatNumber = (num) => {
    if (num === null || num === undefined || num === '') return num;
    const parsed = parseFloat(num);
    if (isNaN(parsed)) return num;
    const decimalPlaces = (parsed.toString().split('.')[1] || '').length;
    return decimalPlaces > 2 ? parsed.toFixed(2) : parsed.toString();
  };

  // 去除拼音声调
  const removeTone = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // 生成股票下拉选项，增加拼音首字母
  const stockOptions = stockList.map(item => {
    let arr = pinyin(item.stockName || '', { pattern: 'first', type: 'array' });
    let joined = arr.join('');
    let noTone = removeTone(joined);
    let pinyinStr = noTone.replace(/[^a-z]/gi, '').toLowerCase();
    return {
      value: item.stockCode,
      label: `${item.stockName} (${item.stockCode})`,
      pinyin: pinyinStr
    };
  });


  return (
    <>
      {loading && (
        <div style={{
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(24,28,38,0.8)', zIndex: 9999
        }}>
          <Spin size="large" tip="加载中..." />
        </div>
      )}
      <div style={{
        padding: 0,
        margin: 0,
        backgroundColor: BG_COLOR,
        color: TEXT_COLOR,
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        fontSize: '14px',
        filter: loading ? 'blur(2px)' : 'none',
        pointerEvents: loading ? 'none' : 'auto'
      }}>
        {/* PAGE DIV*/}
        <div style={{
          // margin: '24px 0 12px 0',
          // padding: '8px 20px 8px 20px',
          backgroundColor: BG_COLOR,
          borderRadius: '6px',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          fontSize: '12px',
          flexWrap: 'wrap',
        }}>
          {/* 股票基本信息 Header */}
          <div style={{marginLeft: '12px', display: 'flex', alignItems: 'center', width: '40vw', maxHeight: '10vh'}}> 
            {/* 返回按钮 */}
            <div>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  marginRight: '12px',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  outline: 'none',
                  color: TEXT_COLOR,
                  fontSize: '22px',
                  transition: 'color 0.2s',
                }}
                onMouseOver={e => e.target.style.color = '#1e90ff'}
                onMouseOut={e => e.target.style.color = TEXT_COLOR}
                aria-label="返回"
              >
                <svg width="40" height="35" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15.5 19L9 12L15.5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            
            {/* 股票基本信息 */}
            <div>
              {/* 股票名称 */}
              <div className='stock-detail-dropdown' style={{ position: 'relative' }}>
                <Select
                  popupClassName='stock-detail-dropdown'
                  showSearch
                  value={stockCode}
                  style={{
                    height: 30,
                    fontSize: 14,
                    background: '#23263a',
                    border: 'none',
                    borderRadius: 6,
                  }}
                  dropdownStyle={{
                    background: '#23263a',
                    color: '#1e90ff',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                  options={stockOptions}
                  placeholder="输入股票代码或名称搜索"
                  filterOption={(input, option) => {
                    const { stockName, stockCode } = stockList.find(s => s.stockCode === option.value) || {};
                    const pinyin = option.pinyin || '';
                    return (
                      (stockName && stockName.toLowerCase().includes(input.toLowerCase())) ||
                      (stockCode && stockCode.toLowerCase().includes(input.toLowerCase())) ||
                      (pinyin && pinyin.includes(input.toLowerCase()))
                    );
                  }}
                  onChange={val => {
                    const idx = stockList.findIndex(s => s.stockCode === val);
                    if (idx >= 0) setCurrentIndex(idx);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.stopPropagation();
                    }
                  }}
                  optionLabelProp="label"
                  size="large"
                  dropdownClassName="stock-dropdown-hover"
                  showArrow={true}
                  allowClear={false}
                  listHeight={256}
                  virtual={true}
                  keyboard={true}
                  notFoundContent="未找到匹配的股票"
                />
                <span style={{ marginLeft: 16, color: '#aaa', fontSize: '13px' }}>
                    {stockList.length > 0 ? `${currentIndex + 1}/${stockList.length}` : ''}
                </span>
              </div>
              {/* 股票标签 */}
              <div style={{marginTop: 10}}>
                {Array.isArray(stockDetail.tags) && stockDetail.tags.length > 0 && (() => {
                  // 先找出高亮标签，按HIGHLIGHT_TAG_CONFIG顺序排列
                  const highlightTags = [];
                  const otherTags = [];
                  const used = new Set();
                  HIGHLIGHT_TAG_CONFIG.forEach(cfg => {
                    stockDetail.tags.forEach(tag => {
                      if (!used.has(tag) && tag.includes(cfg.tagName)) {
                        highlightTags.push({ tag, color: cfg.color });
                        used.add(tag);
                      }
                    });
                  });
                  stockDetail.tags.forEach(tag => {
                    if (!used.has(tag)) otherTags.push(tag);
                  });
                  const renderTag = (tag, idx, color) => (
                    <span key={tag + idx} style={{
                      background: color ? color + '22' : BG_COLOR,
                      color: color || TEXT_COLOR,
                      borderRadius: '12px',
                      padding: '2px 3px',
                      fontSize: '12px',
                      marginRight: '8px',
                      marginBottom: '4px',
                      display: 'inline-block',
                      border: color ? `1px solid ${color}` : '1px solid #444',
                      fontWeight: color ? 'bold' : 'normal',
                    }}>{tag}</span>
                  );
                  return [
                    ...highlightTags.map((item, idx) => renderTag(item.tag, idx, item.color)),
                    ...otherTags.map((tag, idx) => renderTag(tag, idx, null)),
                  ];
                })()}
              </div>
            </div>
          </div>
          <div style={{display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', flexDirection: 'column', 
                        minWidth: '30vw', textAlign: 'left'}}>
            <div style={{display: 'flex', flexWrap: 'wrap'}}>
              <span style={{color: TEXT_COLOR}}>综合波动系数: <span style={{color: '#11d1e4'}}>{stockStats.volatility}</span></span>
              <span style={{color: TEXT_COLOR}}>（</span>
              <span style={{color: TEXT_COLOR}}>标准差/均值: <span style={{color: '#11d1e4'}}>{stockStats.stdOverMean}</span></span>
              <span style={{color: TEXT_COLOR}}>|</span>
              <span style={{color: TEXT_COLOR}}>最大涨跌幅: <span style={{color: '#ff00ff'}}>{stockStats.maxFluct}</span></span>
              <span style={{color: TEXT_COLOR}}>）</span>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap'}}>
              <span style={{color: TEXT_COLOR}}>综合波动系数V2: <span style={{color: '#11d1e4'}}>{stockStats.volatilityV2?.volatility || 0}</span></span>
            </div>
            <div style={{marginTop: '4px', letterSpacing: 1}}>
              <span style={{color: TEXT_COLOR}}>最近一年长阳线: <span style={{color: '#11d1e4'}}>{stockStats.longBullCount}</span></span>
            </div>
            <div style={{marginTop: '4px', color: '#ffd700', letterSpacing: 1}}>
              <span style={{color: TEXT_COLOR}}>最近一年跌停/一字跌停: <span style={{color: '#11d1e4'}}>{stockStats.downLimitCount}/{stockStats.lockedLimitDownCount}</span></span>
              <Tooltip
                title={
                  <div>
                    {declineResult.scenarios && declineResult.scenarios.length > 0 ? (
                      <table style={{ color: '#fff', fontSize: 13, minWidth: 300 }}>
                        <thead>
                          <tr>
                            <th>场景</th>
                            <th>均价↓</th>
                            <th>均量↑</th>
                          </tr>
                        </thead>
                        <tbody>
                          {declineResult.scenarios.map((s, idx) => (
                            <tr key={idx}>
                              <td>{s.label}</td>
                              <td>{s.priceDecline ? `${s.avgCloseRecent} < ${s.avgCloseCompare}` : `${s.avgCloseRecent} ≥ ${s.avgCloseCompare}`}</td>
                              <td>{s.tradingVolumeInc ? `${s.avgVolRecent} > ${s.avgVolCompare}` : `${s.avgVolRecent} ≤ ${s.avgVolCompare}`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : '无数据'}
                  </div>
                }
                color="#23263a"
                placement="topLeft"
                overlayStyle={{ maxWidth: 400 }}
                getPopupContainer={trigger => trigger.parentNode}
              >
                <span style={{color: TEXT_COLOR, marginLeft: 8, cursor: 'pointer', textDecoration: 'underline dashed'}}>增量下跌: {declineResult.isDecline ? '是' : '否'}{declineResult.isDecline && `（${declineResult.scenario}）`}</span>
              </Tooltip>
            </div>
            <div style={{marginTop: '4px', letterSpacing: 1}}>
              <span style={{color: TEXT_COLOR}}>计算过程数据: </span>
              
              {/* 分析详情显示 */}
              {apiScoreResult.analyserDetail && apiScoreResult.analyserDetail.length > 0 && (
                <Tooltip
                  title={
                    <div style={{ fontSize: '12px', maxWidth: '800px' }}>
                      {apiScoreResult.analyserDetail.map((detail, index) => (
                        <div key={index} style={{ 
                          marginBottom: '4px',
                          lineHeight: '1.4',
                          wordBreak: 'break-all'
                        }}>
                          {detail}
                        </div>
                      ))}
                    </div>
                  }
                  color="#23263a"
                  placement="topLeft"
                  overlayStyle={{ maxWidth: '800px' }}
                  getPopupContainer={trigger => trigger.parentNode}
                >
                  <span style={{
                    color: '#11d1e4',
                    cursor: 'pointer',
                    textDecoration: 'underline dashed',
                    fontSize: '11px',
                    marginLeft: '8px'
                  }}>
                    分析详情
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
          
          <div>
            {/* 股票分数显示 */}
            {apiScoreResult && Object.keys(apiScoreResult).length > 0 && (() => {
              return (
                <div style={{
                  // background: '#23263a',
                  // color: '#fff',
                  borderRadius: 6,
                  padding: '8px 12px',
                  // border: '1px solid #444',
                  minWidth: '25vw',
                }}>
                  <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 'bold' }}>
                    总分: <span style={{ color: '#ffd700', fontSize: 12 }}>{(() => {
                      const score = parseFloat(apiScoreResult.score);
                      return formatNumber(score);
                    })()}</span>
                    <span> + </span>
                    <span style={{ color: '#1e90ff', fontSize: 12 }}>{(() => {
                      const extraScore = parseFloat(apiScoreResult.extraScore);
                      return formatNumber(extraScore);
                    })()}</span>

                    {(() => {
                      const scoreResult = calcScore(chartData);
                      return (
                        <span style={{ color: '#1e90ff', fontSize: 12 }}>(旧：{scoreResult.score})</span>
                      );
                    })()}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', paddingRight: 8 }}>名称</th>
                          <th style={{ textAlign: 'left', paddingRight: 8 }}>原始值</th>
                          <th style={{ textAlign: 'left' }}>分数</th>
                          <th style={{ textAlign: 'left' }}>总分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiScoreResult.scoreDetail && Object.keys(apiScoreResult.scoreDetail).map(key => {
                          const item = apiScoreResult.scoreDetail[key];
                          
                          return (
                            <tr key={key}>
                              <td>{item?.name}</td>
                              <td style={{ textAlign: 'left', color: '#1e90ff' }}>{formatNumber(item?.value)}</td>
                              <td style={{ textAlign: 'left', color: '#ffd700' }}>{formatNumber(item?.score)}</td>
                              <td style={{ textAlign: 'left', color: '#ffd700' }}>{formatNumber(item?.weight)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: 'calc(100vh - 15vh)',
          padding: '10px',
          gap: '10px',
          position: 'relative'
        }}>
          {/* 右上角操作区：MA线选择、区间选择、重置 */}
          <div style={{
            position: 'absolute',
            top: 5,
            right: 20,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(35,38,58,0.95)',
            borderRadius: 6,
            padding: '6px 14px',
            boxShadow: '0 2px 8px #0003',
          }}>
            {/* 后退按钮（极简风格，仅箭头SVG，无背景无边框） */}
            <button
              onClick={handleBackChartEndDate}
              disabled={chartEndDateHistory.current.length === 0}
              style={{
                marginRight: 6,
                padding: 0,
                background: 'none',
                border: 'none',
                cursor: chartEndDateHistory.current.length === 0 ? 'not-allowed' : 'pointer',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'none',
              }}
              title="返回上一个截止期日"
              className={chartEndDateHistory.current.length === 0 ? 'arrow-btn-disabled' : 'arrow-btn'}
            >
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  color: chartEndDateHistory.current.length === 0 ? '#888' : '#fff',
                  transition: 'transform 0.18s cubic-bezier(.4,2,.6,1)',
                  willChange: 'transform',
                  pointerEvents: 'none',
                }}
                className="arrow-svg"
              >
                <path d="M15.5 19L9 12L15.5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span style={{marginRight: 4, color: '#fff'}}>均线:</span>
            <Select
              mode="multiple"
              value={selectedMAs}
              onChange={setSelectedMAs}
              style={{ minWidth: 80, width: 110, height:25, background: '#181c26', color: '#fff', border: 'none' }}
              dropdownStyle={{ background: '#23263a', color: '#fff' }}
              popupClassName="ma-select-dark"
              options={MA_CONFIG.map(ma => ({
                value: ma.key,
                label: <span style={{ color: ma.color }}>{ma.label}</span>
              }))}
              placeholder="选择均线"
              maxTagCount={2}
              bordered={false}
              size="small"
            />
            <span style={{marginLeft: 2, color: '#fff'}}>区间:</span>
            {[1, 3, 5, 10, 20].map(y => (
              <button
                key={y}
                onClick={() => handleRangeChange(y)}
                style={{
                  marginLeft: 0,
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
              >
                {y}
              </button>
            ))}
            <button
              onClick={handleSimulateUp}
              style={{
                marginLeft: 2,
                padding: '2px 8px',
                background: '#23263a',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'normal',
                fontSize: '13px',
                outline: 'none',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => e.target.style.background = '#333'}
              onMouseOut={e => e.target.style.background = '#23263a'}
            >
              模拟上涨
            </button>
            <button
              onClick={handleReset}
              style={{
                marginLeft: 2,
                padding: '2px 12px',
                backgroundColor: '#23263a',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                transition: 'background 0.2s',
              }}
              onMouseOver={e => e.target.style.backgroundColor = '#333'}
              onMouseOut={e => e.target.style.backgroundColor = '#23263a'}
            >
              重置
            </button>
            {/* 妖股操作按钮 */}
            {stockDetail.yaoGu ? (
              <button
                onClick={handleRemoveYaogu}
                style={{
                  marginLeft: 8,
                  padding: '2px 12px',
                  backgroundColor: '#ff4444',
                  color: '#fff',
                  border: '1px solid #ff4444',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  transition: 'background 0.2s',
                }}
                onMouseOver={e => e.target.style.backgroundColor = '#ff8888'}
                onMouseOut={e => e.target.style.backgroundColor = '#ff4444'}
              >
                取消妖股
              </button>
            ) : (
              <button
                onClick={handleAddYaogu}
                style={{
                  marginLeft: 8,
                  padding: '2px 12px',
                  backgroundColor: '#23b14d',
                  color: '#fff',
                  border: '1px solid #23b14d',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  transition: 'background 0.2s',
                }}
                onMouseOver={e => e.target.style.backgroundColor = '#4be37a'}
                onMouseOut={e => e.target.style.backgroundColor = '#23b14d'}
              >
                添加妖股
              </button>
            )}
            <span style={{marginRight: 0, color: '#fff'}}>收藏:</span>
            <Rate
                count={5}
                value={favoriteStars}
                onChange={stockFavorite}
                allowClear={true}
                style={{ color: '#ffd700', fontSize: 16 }}
            />
          </div>
          {/* K线图区域 */}
          <div style={{ 
            flex: '2',
            backgroundColor: BG_COLOR,
            border: '1px solid #23263a',
            borderRadius: '4px'
          }}>
            <div id="kline-chart" style={{ width: '100%', height: '100%' }}></div>
          </div>
          {/* 交易量图区域 */}
          <div style={{
            flex: '1',
            backgroundColor: BG_COLOR,
            border: '1px solid #23263a',
            borderRadius: '4px',
            width: '100%', 
            height: '100%'
          }}>
            <div id="volume-chart" style={{ width: '100%', height: '100%' }}></div>
          </div>
        </div>
        <div style={{
          position: 'fixed',
          left: (() => {
            const popupWidth = magnifierWidth;
            const margin = 20;
            if (magnifier.x + margin + popupWidth > window.innerWidth) {
              return Math.max(0, magnifier.x - popupWidth - margin);
            }
            return magnifier.x + margin;
          })(),
          top: popupTop,
          zIndex: 2000,
          display: (magnifier.visible && magnifier.idx != null) ? 'block' : 'none',
          pointerEvents: 'none',
          background: '#23263a',
          border: '1px solid #444',
          borderRadius: 8,
          boxShadow: '0 2px 12px #000a',
          width: magnifierWidth,
          height: magnifierHeight,
          padding: 8,
          overflow: 'hidden',
        }}>
          {/* 放大镜区间日期和统计显示 */}
          {(magStartDate && magEndDate) && (
            <div style={{
              position: 'absolute',
              top: 10,
              right: 18,
              color: TEXT_COLOR,
              fontSize: 10,
              zIndex: 10,
              background: 'rgba(24,28,38,0.85)',
              borderRadius: 6,
              padding: '2px 10px',
              pointerEvents: 'none',
              fontWeight: 'bold',
              letterSpacing: 1,
              textAlign: 'right',
              minWidth: 120
            }}>
              <div>{magStartDate} ~ {magEndDate}</div>
              <div>长阳线: <span style={{ color: '#e4c441' }}>{magLongBullCount}</span> 跌停: <span style={{ color: '#11d1e4' }}>{magDownLimitCount}</span></div>
            </div>
          )}
          <div id="magnifier-kline" style={{ width: '100%', height: '100%' }}></div>
        </div>
      </div>
    </>
  );
};

export default StockDetail;