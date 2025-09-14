import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import * as echarts from 'echarts';
import { calcStockStats, incrementalDecline, calcScore } from '../utils/calcVolatility';
import { message, Select, Spin, Rate, Tooltip, Modal, Form, DatePicker, Input, Button } from 'antd';
import 'antd/dist/reset.css';
import '../App.css';
import { pinyin } from 'pinyin-pro';
import { API_HOST } from '../config/config';
import dayjs from 'dayjs';

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
  const navigate = useNavigate();
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
  const [rangeYears, setRangeYears] = useState(10); // 默认5年
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
  const [stockDetailLoaded, setStockDetailLoaded] = useState(false); // 股票详情加载状态
  
  // 龙虎榜tooltip状态
  const [lhbTooltip, setLhbTooltip] = useState({ visible: false, x: 0, y: 0 });
  const isMouseInLhbTooltipRef = useRef(false);
  
  // 题材信息tooltip状态
  const [themeTooltip, setThemeTooltip] = useState({ visible: false, x: 0, y: 0 });
  const isMouseInTooltipRef = useRef(false);
  
  // 处理龙虎榜tooltip显示
  const handleLhbMouseEnter = (e) => {
    if (stockDetail.lhbs && stockDetail.lhbs.length > 0) {
      // 将tooltip显示在龙虎榜文本下方，避免鼠标移动路径
      const rect = e.target.getBoundingClientRect();
      setLhbTooltip({
        visible: true,
        x: rect.left,
        y: rect.bottom + 5
      });
      isMouseInLhbTooltipRef.current = false;
    }
  };
  
  const handleLhbMouseLeave = () => {
    // 延迟隐藏，给用户时间移动到tooltip
    setTimeout(() => {
      if (!isMouseInLhbTooltipRef.current) {
        setLhbTooltip({ visible: false, x: 0, y: 0 });
      }
    }, 100);
  };
  
  // 处理龙虎榜tooltip内容区域的鼠标事件
  const handleLhbTooltipMouseEnter = () => {
    isMouseInLhbTooltipRef.current = true;
    setLhbTooltip(prev => ({ ...prev, visible: true }));
  };
  
  const handleLhbTooltipMouseLeave = () => {
    isMouseInLhbTooltipRef.current = false;
    setLhbTooltip({ visible: false, x: 0, y: 0 });
  };
  
  // 处理题材信息tooltip显示
  const handleThemeMouseEnter = (e) => {
    if (stockDetail.themes && stockDetail.themes.length > 0) {
      // 将tooltip显示在图标下方，避免鼠标移动路径
      const rect = e.target.getBoundingClientRect();
      setThemeTooltip({
        visible: true,
        x: rect.left,
        y: rect.bottom + 5
      });
      isMouseInTooltipRef.current = false;
    }
  };
  
  const handleThemeMouseLeave = () => {
    // 延迟隐藏，给用户时间移动到tooltip
    setTimeout(() => {
      if (!isMouseInTooltipRef.current) {
        setThemeTooltip({ visible: false, x: 0, y: 0 });
      }
    }, 100);
  };
  
  // 处理题材tooltip内容区域的鼠标事件
  const handleThemeTooltipMouseEnter = () => {
    isMouseInTooltipRef.current = true;
    setThemeTooltip(prev => ({ ...prev, visible: true }));
  };
  
  const handleThemeTooltipMouseLeave = () => {
    isMouseInTooltipRef.current = false;
    setThemeTooltip({ visible: false, x: 0, y: 0 });
  };
  
  // 监控配置相关状态
  const [showWatchConfigModal, setShowWatchConfigModal] = useState(false);
  const [watchConfigForm] = Form.useForm();
  const [watchModelOptions, setWatchModelOptions] = useState([]);

  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [headerHeight, setHeaderHeight] = useState(calculateHeaderHeight());

  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
      setHeaderHeight(calculateHeaderHeight());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function calculateHeaderHeight() {
    return window.innerHeight > 600 ? window.innerHeight * 0.15 : '100px';
    // return '100px';
  }

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
    { tagName: '石油', color: '#ff9800' },  // 青色
    { tagName: '机构重仓', color: '#00bcd4' },  // 橙色
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

  // 平板左右快速滑动切换股票
  // 实现原理：通过监听touchstart和touchend事件，计算滑动距离、时间和速度
  // 只有满足快速水平滑动条件时才切换股票，避免误触和与页面滚动冲突
  useEffect(() => {
    // 触摸状态变量
    let touchStartX = 0;      // 触摸开始X坐标
    let touchStartY = 0;      // 触摸开始Y坐标
    let touchStartTime = 0;   // 触摸开始时间
    let touchEndX = 0;        // 触摸结束X坐标
    let touchEndY = 0;        // 触摸结束Y坐标
    let touchEndTime = 0;     // 触摸结束时间
    
    // 滑动检测参数
    const minSwipeDistance = 80; // 最小滑动距离（增加距离要求）
    const maxVerticalDistance = 120; // 最大垂直滑动距离
    const maxSwipeTime = 800; // 最大滑动时间（毫秒）- 快速滑动
    const minSwipeVelocity = 0.5; // 最小滑动速度（像素/毫秒）

    // 触摸开始：记录起始位置和时间
    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    };

    // 触摸结束：计算滑动参数并判断是否切换股票
    const handleTouchEnd = (e) => {
      if (!stockList.length) return;
      
      // 获取触摸结束位置和时间
      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;
      touchEndTime = Date.now();
      
      // 计算滑动参数
      const deltaX = touchEndX - touchStartX;           // 水平滑动距离
      const deltaY = Math.abs(touchEndY - touchStartY); // 垂直滑动距离
      const deltaTime = touchEndTime - touchStartTime;  // 滑动时间
      const velocity = Math.abs(deltaX) / deltaTime;    // 滑动速度（像素/毫秒）
      
      // 双重检测：水平滑动 + 快速滑动
      const isHorizontalSwipe = Math.abs(deltaX) > minSwipeDistance && deltaY < maxVerticalDistance;
      const isQuickSwipe = deltaTime < maxSwipeTime && velocity > minSwipeVelocity;
      
      // 只有同时满足水平滑动和快速滑动才切换股票
      if (isHorizontalSwipe && isQuickSwipe) {
        if (deltaX > 0) {
          // 向右快速滑动 - 上一个股票
          setCurrentIndex(idx => (idx > 0 ? idx - 1 : stockList.length - 1));
        } else {
          // 向左快速滑动 - 下一个股票
          setCurrentIndex(idx => (idx < stockList.length - 1 ? idx + 1 : 0));
        }
      }
    };

    // 监听整个页面的触摸事件（使用passive提高性能）
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    // 清理事件监听器
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
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
      // 从URL参数获取Tab状态
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

  // 获取监控模式选项
  const fetchWatchModelOptions = async () => {
    try {
      const response = await fetch(`${API_HOST}/stock/watch/getWatchModelMap`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      if (result && typeof result === 'object') {
        const options = Object.entries(result).map(([key, value]) => ({
          value: key,
          label: value
        }));
        setWatchModelOptions(options);
      } else {
        setWatchModelOptions([]);
      }
    } catch (error) {
      console.error('获取监控模式选项失败:', error);
      setWatchModelOptions([]);
    }
  };

  // 获取最近5年最低价格
  const getMinClosePrice = () => {
    if (allStockData.length === 0) return null;
    
    // 获取最近5年的数据
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const fiveYearsAgoStr = fiveYearsAgo.toISOString().slice(0, 10);
    
    // 过滤最近5年的数据
    const recentData = allStockData.filter(item => item.date >= fiveYearsAgoStr);
    
    if (recentData.length === 0) {
      // 如果没有最近5年数据，使用所有数据
      const allPrices = allStockData.map(item => parseFloat(item.closePrice)).filter(price => !isNaN(price));
      if (allPrices.length === 0) return null;
      const minPrice = Math.min(...allPrices);
      return minPrice.toFixed(2);
    }
    
    // 找到最低的closePrice
    const prices = recentData.map(item => parseFloat(item.closePrice)).filter(price => !isNaN(price));
    if (prices.length === 0) return null;
    
    const minPrice = Math.min(...prices);
    return minPrice.toFixed(2);
  };

  // 判断是否有监控配置
  const hasWatchConfig = () => {
    return stockDetail.breakBelowPriceWatch !== null;
  };

  // 创建或更新监控配置
  const createWatchConfig = async (values) => {
    try {
      const response = await fetch(`${API_HOST}/stock/watch/createOrUpdateWatchConfig`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          stockCode: stockCode,
          startDate: values.startDate.format('YYYY-MM-DD'),
        }),
      });

      if (response.ok) {
        // 使用setStockDetail更新状态，触发重新渲染
        setStockDetail(prev => ({
          ...prev,
          breakBelowPriceWatch: {
            ...values,
            startDate: values.startDate.format('YYYY-MM-DD')
          }
        }));

        setShowWatchConfigModal(false);
        watchConfigForm.resetFields();
        
        // 显示成功消息
        const isEdit = stockDetail.breakBelowPriceWatch !== null;
        message.success(isEdit ? '监控配置更新成功' : '监控配置创建成功');
      } else {
        message.error('监控配置保存失败');
      }
    } catch (error) {
      console.error('保存监控配置失败:', error);
      message.error('保存监控配置失败，请重试');
    }
  };

  // 计算区间（最近N年）并筛选数据
  useEffect(() => {
    if (allStockData.length > 0) {
      const allDates = allStockData.map(item => item.date);
      const maxDate = chartEndDate || allDates[allDates.length - 1];
      const minDate = allDates[0];
      const startDate = getDateNDaysAgo(maxDate, rangeYears);
      const chartStartDate = startDate < minDate ? minDate : startDate;
      const filtered = allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);
      setChartData(filtered);
    }
  }, [allStockData, rangeYears, chartEndDate]);

  // 渲染图表
  useEffect(() => {
    if (chartData.length > 0 && stockDetailLoaded) {
      return renderCharts();
    }
  }, [chartData, selectedMAs, stockDetailLoaded, stockDetail.breakBelowPriceWatch]);

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

  // 当股票代码变化时重置股票详情加载状态
  useEffect(() => {
    setStockDetailLoaded(false);
  }, [stockCode]);

  // 当弹窗打开时，设置表单初始值
  useEffect(() => {
    console.log('useEffect triggered:', { showWatchConfigModal, stockDetail, stockCode });
    if (showWatchConfigModal) {
      // 使用setTimeout确保表单完全渲染后再设置值
      setTimeout(() => {
        console.log('Form instance:', watchConfigForm);
        console.log('Form methods available:', typeof watchConfigForm.setFieldsValue);
        
        if (stockDetail.breakBelowPriceWatch) {
          console.log('Setting form values for existing config:', stockDetail.breakBelowPriceWatch);
          // 如果有现有配置，回显数据
          const formValues = {
            stockCode: stockCode,
            watchModel: stockDetail.breakBelowPriceWatch.watchModel,
            targetPrice: stockDetail.breakBelowPriceWatch.targetPrice,
            startDate: stockDetail.breakBelowPriceWatch.startDate ? dayjs(stockDetail.breakBelowPriceWatch.startDate) : null
          };
          console.log('Form values to set:', formValues);
          watchConfigForm.setFieldsValue(formValues);
        } else {
          console.log('Setting default form values');
          // 如果没有配置，设置默认值
          const defaultValues = {
            stockCode: stockCode
          };
          console.log('Default form values to set:', defaultValues);
          watchConfigForm.setFieldsValue(defaultValues);
        }
      }, 100);
    }
  }, [showWatchConfigModal, stockDetail.breakBelowPriceWatch, stockCode]);

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
        setStockDetailLoaded(true); // 标记股票详情已加载完成
      } else {
        setStockDetail({});
        setYaoGu(false);
        setIsFavorite(false);
        setFavoriteStars(0);
        setStockDetailLoaded(true); // 即使失败也标记为已加载
      }
    } catch {
      setStockDetail({});
      setYaoGu(false);
      setIsFavorite(false);
      setFavoriteStars(0);
      setStockDetailLoaded(true); // 即使异常也标记为已加载
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

  const chenJiaoLiangConvert = (value) => {
    if(value == NaN) {
      return 0;
    }
    if (value >= 100000000) {
      // 大于等于1亿，显示为亿
      return (value / 100000000).toFixed(0) + '亿';
    } else if (value >= 10000000) {
      // 大于等于1千万，显示为千万
      return (value / 10000000).toFixed(0) + '千万';
    } else if (value >= 10000) {
      // 大于等于1万，显示为万
      return (value / 10000).toFixed(0) + '万';
    } else {
      // 小于1万，直接显示
      return value.toFixed(0);
    }
  }

  // 保持chartEndDateRef同步
  useEffect(() => {
    chartEndDateRef.current = chartEndDate;
  }, [chartEndDate]);

  // 计算时间跨度并生成xAxis配置
  const getXAxisConfig = (dates) => {
    if (!dates || dates.length === 0) {
      return {
        interval: 0,
        formatter: (value) => value.slice(0, 4)
      };
    }

    // 计算时间跨度（年）
    const startDate = new Date(dates[0]);
    const endDate = new Date(dates[dates.length - 1]);
    const timeSpanYears = (endDate - startDate) / (365.25 * 24 * 60 * 60 * 1000);

    let formatter;

    if (timeSpanYears <= 1) {
      // 少于等于1年：每月显示一个坐标点，格式 2025-08
      formatter = (value, idx) => {
        const date = new Date(value);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        // 第一个总是显示
        if (idx === 0) return yearMonth;
        
        // 检查是否与上一个不同
        const prevDate = new Date(dates[idx - 1]);
        const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        
        return yearMonth !== prevYearMonth ? yearMonth : '';
      };
    } else if (timeSpanYears <= 2) {
      // 大于1年少于等于2年：每两个月显示一个坐标点，格式 2025-08
      formatter = (value, idx) => {
        const date = new Date(value);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (idx === 0) return yearMonth;
        
        const prevDate = new Date(dates[idx - 1]);
        const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        
        return yearMonth !== prevYearMonth ? yearMonth : '';
      };
    } 
    // else if (timeSpanYears <= 3) {
    //   // 大于2年少于等于3年：每3个月显示一个坐标点，格式 2025-08
    //   formatter = (value, idx) => {
    //     const date = new Date(value);
    //     const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
    //     if (idx === 0) return yearMonth;
        
    //     const prevDate = new Date(dates[idx - 1]);
    //     const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        
    //     return yearMonth !== prevYearMonth ? yearMonth : '';
    //   };
    // }
    else if (timeSpanYears <= 6) {
      // 大于3年少于等于6年：每6个月显示一个坐标点，格式 2025-01
      formatter = (value, idx) => {
        const date = new Date(value);
        const month = Math.floor(date.getMonth() / 6) * 6 + 1; // 1月或7月
        const yearMonth = `${date.getFullYear()}-${String(month).padStart(2, '0')}`;
        
        if (idx === 0) return yearMonth;
        
        const prevDate = new Date(dates[idx - 1]);
        const prevMonth = Math.floor(prevDate.getMonth() / 6) * 6 + 1;
        const prevYearMonth = `${prevDate.getFullYear()}-${String(prevMonth).padStart(2, '0')}`;
        
        return yearMonth !== prevYearMonth ? yearMonth : '';
      };
    } else {
      // 大于6年：每年显示一个坐标点，格式 2025
      formatter = (value, idx) => {
        const date = new Date(value);
        const year = date.getFullYear().toString();
        
        if (idx === 0) return year;
        
        const prevDate = new Date(dates[idx - 1]);
        const prevYear = prevDate.getFullYear().toString();
        
        return year !== prevYear ? year : '';
      };
    }

    return { interval: 0, formatter }; // 设置interval为0，让formatter控制显示
  };

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
        // 保持数值类型，避免字符串转换导致的精度问题
        result.push(Number((sum / dayCount).toFixed(2)));
      }
      // 只取区间内部分
      return result.slice(chartStartIdx, chartEndIdx + 1);
    }
    const maList = MA_CONFIG.filter(ma => selectedMAs.includes(ma.key)).map(ma => ({
      ...ma,
      data: calcMA(ma.key)
    }));
    const dates = chartDates;
    const xAxisConfig = getXAxisConfig(dates);
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
        textStyle: { fontSize: 12, fontWeight: 'bold', color: TEXT_COLOR }
      },
      tooltip: {
        trigger: 'axis',
        show: true,
        alwaysShowContent: true,
        renderMode: 'html', // 使用HTML渲染模式
        appendToBody: true, // 将tooltip渲染到body中
        position: function (point, params, dom, rect, size) {
          // 调整tooltip位置，不返回值让echarts自动计算位置
          return [40, -1];
        },
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
          },
          // 添加防抖动配置
          animation: false,           // 禁用动画，减少跳动
          animationDuration: 0,      // 动画时长为0
          animationEasing: 'linear', // 线性动画
          // 添加精度控制
          precision: 2,              // 设置精度为2位小数
          // 添加节流控制
          throttle: 100,             // 增加节流到100ms，减少频繁更新
          // 添加防抖配置
          snap: true,                // 启用吸附功能
          z: 10                      // 设置层级，避免与其他元素冲突
        },
        backgroundColor: 'rgba(24,28,38,0.3)',
        borderColor: 'rgba(35,38,58,0.95)',
        textStyle: { color: TEXT_COLOR },
        extraCssText: 'z-index: 1000 !important;', // 强制设置tooltip的z-index
        formatter: function (params) {
          const data = params[0].data;
          // 获取当前数据点的zhenFu字段
          const currentIndex = params[0].dataIndex;
          const currentData = chartData[currentIndex];
          const zhangDieFu = currentData?.zhangDieFu ?? 0;
          const zhangDieFuColor = zhangDieFu >= 0 ? '#ef232a' : '#14b143'; // 红涨绿跌
          
            return `
             <div style="color: #fff; font-size: 12px; line-height: 1.4;">
               <div style="margin-bottom: 2px;">日期: ${params[0].axisValue}</div>
               <div style="margin-bottom: 2px;">开盘: ${currentData.openPrice}</div>
               <div style="margin-bottom: 2px;">收盘: ${currentData.closePrice}</div>
               <div style="margin-bottom: 2px;">最低: ${currentData.minPrice}</div>
               <div style="margin-bottom: 2px;">最高: ${currentData.maxPrice}</div>
               <div style="margin-bottom: 2px;">涨跌幅: <span style="color:${zhangDieFuColor};font-weight:bold">${Number(zhangDieFu).toFixed(2)}%</span></div>
               <div>成交量: ${chenJiaoLiangConvert(currentData.chenJiaoLiang)}</div>
             </div>
            `;
          // return `
          //     涨跌幅: <span style="color:${zhangDieFuColor};font-weight:bold">${Number(zhangDieFu).toFixed(2)}%</span>
          // `;
        }
      },
      grid: { left: '45px', right: '0%', top: '5%', bottom: '5%' },
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
          interval: xAxisConfig.interval,
          formatter: xAxisConfig.formatter
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
          lineStyle: { width: 1, color: ma.color },
          emphasis: { lineStyle: { width: 1 } },
        })),
        // 目标价格虚线
        ...(stockDetail.breakBelowPriceWatch ? [{
          name: '目标价格',
          type: 'line',
          data: new Array(dates.length).fill(stockDetail.breakBelowPriceWatch.targetPrice),
          showSymbol: false,
          lineStyle: { 
            width: 1, 
            color: 'red', 
            type: 'dashed' 
          },
          emphasis: { lineStyle: { width: 1 } },
          tooltip: {
            formatter: function() {
              return `目标价格: ${stockDetail.breakBelowPriceWatch.targetPrice}`;
            }
          }
        }] : [])
      ]
    };
    klineChart.setOption(klineOption);
    
    // 页面首次进入时显示最新一条数据的tooltip
    setTimeout(() => {
      if (dates.length > 0) {
        const lastIndex = dates.length - 1;
        klineChart.dispatchAction({
          type: 'showTip',
          seriesIndex: 0,
          dataIndex: lastIndex
        });
      }
    }, 100);
    
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
    
    // 鼠标离开K线图区域时，显示最新一天的数据
    klineChart.getZr().on('mouseout', function (params) {
      if (dates.length > 0) {
        const lastIndex = dates.length - 1;
        // 增加延迟时间，避免与ECharts内部事件冲突
        setTimeout(() => {
          // 检查图表DOM是否存在
          const chartDom = klineChart.getDom();
          if (!chartDom) {
            return; // 如果图表DOM不存在，直接返回
          }
          
          // 检查鼠标是否真的离开了图表区域
          const rect = chartDom.getBoundingClientRect();
          const mouseX = params.offsetX;
          const mouseY = params.offsetY;
          
          // 如果鼠标仍在图表区域内，不执行showTip
          if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
            return;
          }
          
          klineChart.dispatchAction({
            type: 'showTip',
            seriesIndex: 0,
            dataIndex: lastIndex
          });
        }, 100); // 增加延迟到100ms
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
            show: false  // 隐藏纵坐标上的焦点标签
          }
        },
        backgroundColor: 'rgba(24,28,38,0.95)',
        borderColor: '#333',
        textStyle: { color: TEXT_COLOR },
        formatter: function (params) {
          // const value = params[0].value;
          // let formattedValue;
          // if (value >= 100000000) {
          //   formattedValue = (value / 100000000).toFixed(1) + '亿';
          // } else if (value >= 10000000) {
          //   formattedValue = (value / 10000000).toFixed(1) + '千万';
          // } else if (value >= 10000) {
          //   formattedValue = (value / 10000).toFixed(1) + '万';
          // } else {
          //   formattedValue = value.toFixed(0);
          // }
          // return `成交量: ${formattedValue}`;
        }
      },
      grid: { left: '45px', right: '0%', top: '5%', bottom: '20%' },
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
          interval: xAxisConfig.interval,
          formatter: xAxisConfig.formatter
        },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
      yAxis: {
        scale: true,
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisLabel: { 
          color: TEXT_COLOR,
          formatter: function(value) {
            return chenJiaoLiangConvert(value);
          }
        },
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
    const chartDom = klineChart.getDom();
    const chartCanvas = chartDom ? chartDom.querySelector('canvas') : null;
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

  // 放大镜事件监听 - 支持PC和iPad
  useEffect(() => {
    const klineDom = document.getElementById('kline-chart');
    if (!klineDom) return;
    
    // 长按检测相关变量
    let longPressTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let lastCloseTime = 0; // 记录上次关闭时间，防止重复触发
    
    // iPad双击检测相关变量
    let firstTapTime = 0;
    let firstTapX = 0;
    let firstTapY = 0;
    let doubleTapTimer = null;
    
    const LONG_PRESS_DELAY = 800; // 长按延迟时间（毫秒）
    const MAX_MOVE_DISTANCE = 15; // 长按期间最大移动距离（像素）
    const CLOSE_DEBOUNCE_TIME = 300; // 关闭防抖时间（毫秒）
    const DOUBLE_TAP_DELAY = 300; // 双击检测延迟时间（毫秒）
    const DOUBLE_TAP_DISTANCE = 50; // 双击最大距离（像素）
    
    // 鼠标移动处理（PC端）
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
    
    // 鼠标离开处理（PC端）
    const handleMouseLeave = () => {
      mouseInKline.current = false;
      setMagnifier(m => ({ ...m, visible: false }));
    };
    
    // Ctrl键监听（PC端）
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
    
    // iPad触摸开始处理
    const handleTouchStart = (e) => {
      // 清除之前的定时器
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      
      // 记录触摸开始位置和时间
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      
      // 检查触摸位置是否在K线图内
      const rect = klineDom.getBoundingClientRect();
      const isInKline = touchStartX >= rect.left && touchStartX <= rect.right && 
                       touchStartY >= rect.top && touchStartY <= rect.bottom;
      
      // 双击检测逻辑
      if (isInKline) {
        const currentTime = Date.now();
        const timeDiff = currentTime - firstTapTime;
        const distance = Math.sqrt(
          Math.pow(touchStartX - firstTapX, 2) + Math.pow(touchStartY - firstTapY, 2)
        );
        
        if (timeDiff < DOUBLE_TAP_DELAY && distance < DOUBLE_TAP_DISTANCE) {
          // 检测到双击，清除长按定时器
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          
          // 执行双击切换日期功能
          const x = touchStartX - rect.left;
          const y = touchStartY - rect.top;
          const chart = echarts.getInstanceByDom(klineDom);
          if (chart) {
            const pointInGrid = chart.convertFromPixel({gridIndex: 0}, [x, y]);
            const xIndex = Math.round(pointInGrid[0]);
            const dates = chartData.map(item => item.date);
            if (dates[xIndex]) {
              // 记录历史
              chartEndDateHistory.current.push(chartEndDateRef.current);
              setChartEndDate(dates[xIndex]);
            }
          }
          
          // 重置双击检测变量
          firstTapTime = 0;
          firstTapX = 0;
          firstTapY = 0;
          return;
        } else {
          // 第一次点击或距离太远，记录位置和时间
          firstTapTime = currentTime;
          firstTapX = touchStartX;
          firstTapY = touchStartY;
        }
      }
      
      // longPressTimer = setTimeout(() => {
      //   // 长按激活放大镜功能
      //   setIsMagnifierActive(true);
        
      //   if (isInKline) {
      //     // 在K线图内，计算相对位置并显示放大镜
      //     const x = touchStartX - rect.left;
      //     const y = touchStartY - rect.top;
      //     lastMousePositionRef.current = { x, y };
          
      //     const chart = echarts.getInstanceByDom(klineDom);
      //     if (chart) {
      //       const pointInGrid = chart.convertFromPixel({gridIndex: 0}, [x, y]);
      //       const idx = Math.round(pointInGrid[0]);
      //       if (idx >= 0 && idx < chartData.length) {
      //         setMagnifier({ visible: true, x: touchStartX, y: touchStartY, idx });
      //       }
      //     }
      //   } else {
      //     // 不在K线图内，只激活功能但不显示放大镜
      //     mouseInKline.current = false;
      //   }
      // }, LONG_PRESS_DELAY);
    };
    
    // iPad触摸移动处理（取消长按）
    const handleTouchMove = (e) => {
      if (longPressTimer) {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const moveDistance = Math.sqrt(
          Math.pow(currentX - touchStartX, 2) + Math.pow(currentY - touchStartY, 2)
        );
        
        // 如果移动距离超过阈值，取消长按
        if (moveDistance > MAX_MOVE_DISTANCE) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    };
    
    // 关闭放大镜的统一函数（带防抖）
    const closeMagnifier = () => {
      const now = Date.now();
      if (now - lastCloseTime < CLOSE_DEBOUNCE_TIME) {
        return; // 防抖，避免重复触发
      }
      lastCloseTime = now;
      
      if (isMagnifierActive && magnifier.visible) {
        setIsMagnifierActive(false);
        setMagnifier(m => ({ ...m, visible: false }));
      }
    };
    
    // iPad触摸结束处理
    const handleTouchEnd = (e) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      
      // 双击检测超时清理
      if (doubleTapTimer) {
        clearTimeout(doubleTapTimer);
        doubleTapTimer = null;
      }
    };
    
    // 点击屏幕关闭放大镜（iPad）
    const handleClick = (e) => {
      closeMagnifier();
      closeMagnifier();
    };
    
    // 添加事件监听器
    klineDom.addEventListener('mousemove', handleMouseMove);
    klineDom.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // iPad触摸事件监听
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('click', handleClick);
    
    // 清理函数
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
      if (doubleTapTimer) {
        clearTimeout(doubleTapTimer);
      }
      klineDom.removeEventListener('mousemove', handleMouseMove);
      klineDom.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('click', handleClick);
    };
  }, [chartData, magnifier.idx, isMagnifierActive, magnifier.visible]);

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
          padding: '8px 20px 8px 20px',
          backgroundColor: BG_COLOR,
          borderRadius: '6px',
          maxHeight: `${headerHeight}px`,
          border: 'none',
          display: 'flex',
          alignItems: 'flex-start',  // 改为置顶对齐
          justifyContent: 'flex-start',  // 改为靠左对齐
          fontSize: '12px',
          flexWrap: 'wrap',
        }}>
          {/* 股票基本信息 Header */}
          <div style={{marginLeft: '12px', display: 'flex', alignItems: 'flex-start', width: '35vw', maxHeight: '10vh'}}>             
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
                    zIndex: 9999,
                  }}
                  dropdownStyle={{
                    background: '#23263a',
                    color: '#1e90ff',
                    borderRadius: 6,
                    fontSize: 14,
                    zIndex: 9999,
                  }}
                  getPopupContainer={() => document.body}
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
                  listHeight={400}
                  virtual={true}
                  keyboard={true}
                  notFoundContent="未找到匹配的股票"
                />
                <span style={{ marginLeft: 16, color: '#aaa', fontSize: '12px' }}>
                    {stockList.length > 0 ? `${currentIndex + 1}/${stockList.length}` : ''}
                </span>
                {/* 题材信息图标 */}
                {stockDetail.themes && stockDetail.themes.length > 0 && (
                  <span 
                    style={{ 
                      marginLeft: 16, 
                      color: '#1890ff', 
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '15px',
                      height: '15px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(24, 144, 255, 0.1)',
                      border: '1px solid #1890ff'
                    }}
                    onMouseEnter={handleThemeMouseEnter}
                    onMouseLeave={handleThemeMouseLeave}
                    title="题材信息"
                  >
                    i
                  </span>
                )}
                {/* 龙虎榜次数 */}
                {stockDetail.lhbs && stockDetail.lhbs.length > 0 && (
                  <span 
                    style={{ 
                      marginLeft: 16, 
                      color: '#1890ff', 
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                    onMouseEnter={handleLhbMouseEnter}
                    onMouseLeave={handleLhbMouseLeave}
                  >
                    龙虎榜({stockDetail.lhbs.length})
                  </span>
                )}
              </div>
              {/* 股票标签 */}
              <div style={{
                marginTop: 2,
                maxHeight: `${headerHeight - 30}px`,
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarWidth: 'none', /* Firefox */
                msOverflowStyle: 'none', /* IE and Edge */
                WebkitScrollbar: { display: 'none' } /* Chrome, Safari, Opera */
              }}>
                <style>
                  {`
                    div::-webkit-scrollbar {
                      display: none;
                    }
                  `}
                </style>
                {Array.isArray(stockDetail.tags) && stockDetail.tags.length > 0 && (() => {
                  // 获取标签颜色
                  const getTagColor = (tag) => {
                    for (const cfg of HIGHLIGHT_TAG_CONFIG) {
                      if (tag.includes(cfg.tagName)) {
                        return cfg.color;
                      }
                    }
                    return null;
                  };
                  
                  // 渲染标签
                  const renderTag = (tag, idx, isHighlight = false) => {
                    const color = getTagColor(tag);
                    return (
                      <span key={`${tag}-${idx}-${isHighlight ? 'highlight' : 'normal'}`} style={{
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
                  };
                  
                  // 找出高亮标签
                  const highlightTags = [];
                  const normalTags = [];
                  
                  stockDetail.tags.forEach(tag => {
                    // 如果标签有颜色，则添加到高亮标签中
                    if (getTagColor(tag)) {
                      highlightTags.push(tag);
                    } else {
                      // normalTags.push(tag);
                    }
                    normalTags.push(tag);
                  });
                  
                  // 先渲染高亮标签，再渲染普通标签
                  return [
                    ...highlightTags.map((tag, idx) => renderTag(tag, idx, true)),
                    ...normalTags.map((tag, idx) => renderTag(tag, idx, false))
                  ];
                })()}
              </div>
            </div>
          </div>
          <div style={{display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', flexDirection: 'column', 
                        width: '30vw', textAlign: 'left'}}>
            <div style={{display: 'flex', flexWrap: 'wrap'}}>
              <span style={{color: TEXT_COLOR}}>综合波动系数: <span style={{color: '#11d1e4'}}>{stockStats.volatility}</span></span>
              <span style={{color: TEXT_COLOR}}>(</span>
              <span style={{color: TEXT_COLOR}}>标准差: <span style={{color: '#11d1e4'}}>{stockStats.stdOverMean}</span></span>
              <span style={{color: TEXT_COLOR}}>|</span>
              <span style={{color: TEXT_COLOR}}>最大涨跌幅: <span style={{color: '#ff00ff'}}>{stockStats.maxFluct}</span></span>
              <span style={{color: TEXT_COLOR}}>)</span>
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
          
          <div style={{width: '30vw'}}>
            {/* 股票分数显示 */}
            {apiScoreResult && Object.keys(apiScoreResult).length > 0 && (() => {
              return (
                <div style={{
                  // background: '#23263a',
                  // color: '#fff',
                  borderRadius: 6,
                  // padding: '8px 12px',
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
        <div 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height:  `${window.innerHeight - headerHeight - 20}px`,
            padding: '10px',
            gap: '10px',
            position: 'relative'
        }}>
          {/* 右上角操作区：MA线选择、区间选择、重置 */}
          <div style={{
            position: 'absolute',
            top: 10,
            right: 10,
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
            {/* 添加监控配置按钮 */}
            <button
              onClick={() => {
                setShowWatchConfigModal(true);
                fetchWatchModelOptions();
                
                // 延迟设置表单值，确保数据已加载
                setTimeout(() => {
                  const minPrice = getMinClosePrice();
                  const defaultWatchModel = watchModelOptions.length > 0 ? watchModelOptions[0].value : '';
                  watchConfigForm.setFieldsValue({
                    stockCode: stockCode,
                    startDate: dayjs(),
                    targetPrice: minPrice || '',
                    watchModel: defaultWatchModel,
                  });
                }, 100);
              }}
              style={{
                marginRight: 8,
                padding: '2px 8px',
                background: '#23263a',
                color: '#fff',
                border: hasWatchConfig() ? '2px solid #1e90ff' : '1px solid #444',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'normal',
                fontSize: '12px',
                outline: 'none',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                // width: '24px',
                // height: '24px',
              }}
              onMouseOver={e => {
                e.target.style.background = '#333';
                e.target.style.borderColor = hasWatchConfig() ? '#1e90ff' : '#666';
              }}
              onMouseOut={e => {
                e.target.style.background = '#23263a';
                e.target.style.borderColor = hasWatchConfig() ? '#1e90ff' : '#444';
              }}
              title={hasWatchConfig() ? '已有监控配置，点击修改' : '添加监控配置'}
            >
              监控
            </button>
            
            <span style={{marginRight: 0, color: '#fff'}}>均线:</span>
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
            flex: '5',
            backgroundColor: BG_COLOR,
            border: '1px solid #23263a',
            borderRadius: '4px'
          }}>
            <div id="kline-chart" style={{ width: '100%', height: '100%' }}></div>
          </div>
          {/* 交易量图区域 */}
          <div style={{
            flex: '2',
            backgroundColor: BG_COLOR,
            border: '1px solid #23263a',
            borderRadius: '4px',
            width: '100%', 
            height: '100%'
          }}>
            <div id="volume-chart" style={{ width: '100%', height: '100%' }}></div>
          </div>
        </div>
        
        {/* 股票切换按钮 - 右下角 */}
        <div style={{
          position: 'fixed',
          bottom: '0px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          gap: '10px',
          alignItems: 'center'
        }}>
          {/* 上一个按钮 */}
          <button
            onClick={() => {
              if (stockList.length > 0) {
                setCurrentIndex(idx => (idx > 0 ? idx - 1 : stockList.length - 1));
              }
            }}
            disabled={!stockList.length}
            style={{
              width: '50px',
              height: '30px',
              borderRadius: '10%',
              backgroundColor: 'transparent',
              color: '#fff',
              border: 'none',
              cursor: stockList.length ? 'pointer' : 'not-allowed',
              fontSize: '16px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              opacity: stockList.length ? 1 : 0.5,
              boxShadow: 'none'
            }}
            title="上一个股票 (↑)"
          >
            ←
          </button>
          
          {/* 下一个按钮 */}
          <button
            onClick={() => {
              if (stockList.length > 0) {
                setCurrentIndex(idx => (idx < stockList.length - 1 ? idx + 1 : 0));
              }
            }}
            disabled={!stockList.length}
            style={{
              width: '50px',
              height: '30px',
              borderRadius: '10%',
              backgroundColor: 'transparent',
              color: '#fff',
              border: 'none',
              cursor: stockList.length ? 'pointer' : 'not-allowed',
              fontSize: '16px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              opacity: stockList.length ? 1 : 0.5,
              boxShadow: 'none'
            }}
            title="下一个股票 (↓)"
          >
            →
          </button>
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

      {/* 添加监控配置弹窗 */}
      <Modal
        title={stockDetail.breakBelowPriceWatch ? "编辑监控配置" : "添加监控配置"}
        open={showWatchConfigModal}
        onCancel={() => {
          setShowWatchConfigModal(false);
          watchConfigForm.resetFields();
        }}
        footer={null}
        width={400}
        centered
        maskClosable={false}
        className="watch-config-modal"
      >
        <Form
          form={watchConfigForm}
          layout="vertical"
          onFinish={createWatchConfig}
        >
          <Form.Item
            name="stockCode"
            label="股票代码"
            rules={[{ required: true, message: '请输入股票代码' }]}
          >
            <Input disabled />
          </Form.Item>

          <Form.Item
            name="watchModel"
            label="监控模式"
            rules={[
              { required: true, message: '请选择监控模式' },
              {
                validator: (_, value) => {
                  if (value && !watchModelOptions.find(option => option.value === value)) {
                    return Promise.reject(new Error('请选择有效的监控模式'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Select placeholder="请选择监控模式">
              {watchModelOptions.map(option => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="targetPrice"
            label="目标价格"
            rules={[
              { required: true, message: '请输入目标价格' },
              {
                validator: (_, value) => {
                  if (value && parseFloat(value) <= 0) {
                    return Promise.reject(new Error('目标价格必须大于0'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Input placeholder="请输入目标价格" />
          </Form.Item>

          <Form.Item
            name="startDate"
            label="开始日期"
            rules={[
              { required: true, message: '请选择开始日期' }
            ]}
          >
            <DatePicker 
              style={{ width: '100%' }} 
              disabledDate={(current) => {
                // 禁用今天之前的日期
                return current && current < dayjs().startOf('day');
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button
              onClick={() => {
                setShowWatchConfigModal(false);
                watchConfigForm.resetFields();
              }}
              style={{ marginRight: 8 }}
            >
              取消
            </Button>
            <Button 
              type="primary" 
              htmlType="submit"
              onClick={() => {
                // 手动触发表单验证
                watchConfigForm.validateFields()
                  .then(() => {
                    // 验证通过，表单会自动调用 onFinish
                  })
                  .catch((errorInfo) => {
                    console.log('表单验证失败:', errorInfo);
                  });
              }}
            >
              确定
            </Button>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* 龙虎榜tooltip */}
      {lhbTooltip.visible && stockDetail.lhbs && stockDetail.lhbs.length > 0 && (
        <div 
          style={{
            position: 'fixed',
            left: lhbTooltip.x,
            top: lhbTooltip.y,
            // backgroundColor: '#1a1a1a',
            backgroundColor: BG_COLOR,
            color: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '12px',
            maxWidth: '500px',
            minWidth: '300px',
            zIndex: 10000,
            pointerEvents: 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            border: '1px solid #333',
            fontFamily: 'Arial, sans-serif'
          }}
          onMouseEnter={handleLhbTooltipMouseEnter}
          onMouseLeave={handleLhbTooltipMouseLeave}
        >
          <div style={{ 
            fontWeight: 'bold', 
            marginBottom: '12px', 
            color: '#1890ff',
            fontSize: '14px',
            borderBottom: '1px solid #333',
            paddingBottom: '8px'
          }}>
            龙虎榜明细 ({stockDetail.lhbs.length}次)
          </div>
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            scrollbarWidth: 'none', /* Firefox */
            msOverflowStyle: 'none', /* IE and Edge */
            WebkitScrollbar: { display: 'none' } /* Chrome, Safari, Opera */
          }}>
            <style>
              {`
                div::-webkit-scrollbar {
                  display: none;
                }
              `}
            </style>
            {stockDetail.lhbs.map((lhb, index) => (
              <div key={lhb.id || index} style={{ 
                marginBottom: '12px',
                padding: '8px',
                borderRadius: '4px',
                borderLeft: '3px solid #1890ff'
              }}>
                {/* 日期和涨跌幅 */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '6px'
                }}>
                  <span style={{ 
                    fontWeight: 'bold',
                    fontSize: '13px',
                    color: '#ffffff'
                  }}>
                    {lhb.date}
                  </span>
                  <span style={{ 
                    color: lhb.changeRate > 0 ? '#ef232a' : lhb.changeRate < 0 ? '#14b143' : '#fff',
                    fontWeight: 'bold',
                    fontSize: '13px'
                  }}>
                    {lhb.changeRate > 0 ? '+' : ''}{lhb.changeRate.toFixed(2)}%
                  </span>
                </div>
                
                {/* 说明内容 */}
                <div style={{ 
                  fontSize: '11px', 
                  color: '#e0e0e0', 
                  lineHeight: '1.5',
                  textAlign: 'justify'
                }}>
                  {lhb.explanation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 题材信息tooltip */}
      {themeTooltip.visible && stockDetail.themes && stockDetail.themes.length > 0 && (
        <div 
          style={{
            position: 'fixed',
            left: themeTooltip.x,
            top: themeTooltip.y,
            backgroundColor: BG_COLOR,
            color: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '12px',
            maxWidth: '500px',
            minWidth: '300px',
            zIndex: 10001,
            pointerEvents: 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            border: '1px solid #333',
            fontFamily: 'Arial, sans-serif'
          }}
          onMouseEnter={handleThemeTooltipMouseEnter}
          onMouseLeave={handleThemeTooltipMouseLeave}
        >
          <div style={{ 
            fontWeight: 'bold', 
            marginBottom: '12px', 
            color: '#1890ff',
            fontSize: '14px',
            borderBottom: '1px solid #333',
            paddingBottom: '8px'
          }}>
            核心题材
          </div>
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            scrollbarWidth: 'none', /* Firefox */
            msOverflowStyle: 'none', /* IE and Edge */
            WebkitScrollbar: { display: 'none' } /* Chrome, Safari, Opera */
          }}>
            <style>
              {`
                div::-webkit-scrollbar {
                  display: none;
                }
              `}
            </style>
            {stockDetail.themes.map((theme, index) => (
              <div key={theme.id || index} style={{ 
                marginBottom: '12px',
                padding: '8px',
                backgroundColor: BG_COLOR,
                borderRadius: '4px',
                borderLeft: '3px solid #1890ff'
              }}>
                {/* 要点标题 */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start',
                  marginBottom: '6px',
                  flexWrap: 'nowrap',
                  gap: '8px'
                }}>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: '#1890ff',
                    fontSize: '13px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    要点{theme.mainpoint}: {theme.keyClassif}
                  </span>
                  <span style={{ 
                    fontSize: '11px',
                    color: '#999',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    {theme.keyword}
                  </span>
                </div>
                
                {/* 内容 */}
                <div style={{ 
                  fontSize: '11px', 
                  color: '#e0e0e0', 
                  lineHeight: '1.5',
                  textAlign: 'justify'
                }}>
                  {(() => {
                    // 高亮关键字功能
                    const highlightText = (text, highlightWords) => {
                      if (!highlightWords || highlightWords.length === 0) {
                        return text;
                      }
                      
                      // 按长度排序，优先匹配长词
                      const sortedWords = [...highlightWords].sort((a, b) => b.length - a.length);
                      
                      let result = text;
                      sortedWords.forEach(word => {
                        if (word && word.trim()) {
                          const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                          result = result.replace(regex, '<span style="background-color: #ffd700; color: #000; padding: 1px 2px; border-radius: 2px; font-weight: bold;">$1</span>');
                        }
                      });
                      
                      return result;
                    };
                    
                    const highlightedContent = highlightText(theme.mainpointContent, stockDetail.highLightWords);
                    
                    return (
                      <span dangerouslySetInnerHTML={{ __html: highlightedContent }} />
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default StockDetail;