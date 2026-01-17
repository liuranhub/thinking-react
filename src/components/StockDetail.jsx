import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import * as echarts from 'echarts';
import { calcStockStats, incrementalDecline, calcScore } from '../utils/calcVolatility';
import { message, Select, Spin, Rate, Tooltip, Modal, Form, DatePicker, Input, Button, Tag } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import 'antd/dist/reset.css';
import '../App.css';
import { pinyin } from 'pinyin-pro';
import { API_HOST } from '../config/config';
import dayjs from 'dayjs';
import LoadingButton from './LoadingButton';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

dayjs.extend(isSameOrBefore);


const MA_CONFIG = [
    { key: 5, label: 'MA5', color: '#e4c441', default: false },
    { key: 10, label: 'MA10', color: '#ff00ff', default: false },
    { key: 20, label: 'MA20', color: '#11d1e4', default: false },
    { key: 30, label: 'MA30', color: '#23b14d', default: false },
    { key: 60, label: 'MA60', color: '#bdbdbd', default: false },
    { key: 120, label: 'MA120', color: '#1e90ff', default: false },
    { key: 250, label: 'MA250', color: '#ffd700', default: false },
    { key: 500, label: 'MA500', color: '#ffd700', default: false },
  ];

// 高亮标签关键词配置
const HIGHLIGHT_TAG_CONFIG = [
  { tagName: '国企', color: '#1ecb8c' },    // 明亮青绿
  { tagName: '军工', color: '#ff6b81' },    // 柔和珊瑚红
  { tagName: '华为', color: '#1e90ff' },    // 亮蓝
  { tagName: '新能源', color: '#ffd700' },  // 金黄
  { tagName: '固态电池', color: '#ffd700' },  // 金黄
  { tagName: '独角兽', color: '#a259ff' },  // 紫色
  { tagName: '芯片', color: '#ffb86c' },    // 橙黄
  { tagName: '低空经济', color: '#23b14d' },    // 绿色
  { tagName: '无人机', color: '#f672ff' },    // 粉紫
  { tagName: '大飞机', color: '#f672ff' },    // 粉紫
  { tagName: '机器人', color: '#f672ff' },    // 粉紫
  { tagName: '石油', color: '#ff9800' },  // 青色
  { tagName: '机构重仓', color: '#00bcd4' },  // 橙色
    ];

const BG_COLOR = '#181c26';
const AXIS_COLOR = '#888ca0';
const TEXT_COLOR = '#fff';
const RED = '#ef232a';
const GREEN = '#14b143';

// checkList项目配置
const CHECK_LIST_ITEMS = ['金针探底', '增量下跌', '长阳线', '高活跃度'];

let chartGroupId = 'stock-detail-group';

const mottoTags = ['不破不立', '等待', '今日长缨在手,何时缚住苍龙'];

function getDateNDaysAgo(dateStr, years) {
  const d = new Date(dateStr);
  // 如果是小于1年的，按月份计算
  if (years < 1) {
    const months = Math.round(years * 12);
    d.setMonth(d.getMonth() - months);
  } else {
    d.setFullYear(d.getFullYear() - years);
  }
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
  const [selectedMAs, setSelectedMAs] = useState(MA_CONFIG.find(ma => ma.default)?.key || null);
  // 区间选择：最近N年
  const [rangeYears, setRangeYears] = useState(10); // 默认5年
  const [chartEndDate, setChartEndDate] = useState('');
  const chartEndDateRef = useRef(chartEndDate);
  const debouncedSetChartEndDate = useRef(debounce((date) => setChartEndDate(date), 200)).current;
  // 新增：截止期日历史栈
  const chartEndDateHistory = useRef([]);
  const [stockDetail, setStockDetail] = useState({});
  const [yaoGu, setYaoGu] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteStars, setFavoriteStars] = useState(3);
  const [originalData, setOriginalData] = useState([]); // 保存原始K线数据
  const [kLineLatestDate, setKLineLatestDate] = useState(''); // 保存最新K线日期
  const [apiScoreResult, setApiScoreResult] = useState({}); // API分数结果
  const [stockDetailLoaded, setStockDetailLoaded] = useState(false); // 股票详情加载状态
  const [latestStockData, setLatestStockData] = useState(null); // 最新股价数据
  const refreshTimerRef = useRef(null); // 刷新定时器引用
  const [chartRefreshTrigger, setChartRefreshTrigger] = useState(0); // 图表刷新触发器
  const [isLoading, setIsLoading] = useState(false); // 计算按钮加载状态
  
  // 龙虎榜tooltip状态
  const [lhbTooltip, setLhbTooltip] = useState({ visible: false, x: 0, y: 0 });
  const isMouseInLhbTooltipRef = useRef(false);
  
  // 题材信息tooltip状态
  const [themeTooltip, setThemeTooltip] = useState({ visible: false, x: 0, y: 0 });
  const isMouseInTooltipRef = useRef(false);
  
  // AI分析结果tooltip状态
  const [aiTooltip, setAiTooltip] = useState({ visible: false, x: 0, y: 0 });
  const isMouseInAiTooltipRef = useRef(false);
  
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

  // 处理AI分析结果tooltip显示
  const handleAiMouseEnter = (e) => {
    if (stockDetail.aiAnalysisResult && stockDetail.aiAnalysisResult.content) {
      // 将tooltip显示在AI按钮下方，避免鼠标移动路径
      const rect = e.target.getBoundingClientRect();
      setAiTooltip({
        visible: true,
        x: rect.left,
        y: rect.bottom + 5
      });
      isMouseInAiTooltipRef.current = false;
    }
  };

  const handleAiMouseLeave = () => {
    // 延迟隐藏，给用户时间移动到tooltip
    setTimeout(() => {
      if (!isMouseInAiTooltipRef.current) {
        setAiTooltip({ visible: false, x: 0, y: 0 });
      }
    }, 100);
  };

  // 处理AI分析结果tooltip内容区域的鼠标事件
  const handleAiTooltipMouseEnter = () => {
    isMouseInAiTooltipRef.current = true;
    setAiTooltip(prev => ({ ...prev, visible: true }));
  };

  const handleAiTooltipMouseLeave = () => {
    isMouseInAiTooltipRef.current = false;
    setAiTooltip({ visible: false, x: 0, y: 0 });
  };
  
  // 复制股票编码功能
  const handleCopyStockCode = useCallback(async (e) => {
    e.stopPropagation(); // 阻止事件冒泡
    try {
      await navigator.clipboard.writeText(stockCode);
      // 简单的视觉反馈
      const button = e.target.closest('button');
      if (button) {
        const originalColor = button.style.color;
        button.style.color = '#52c41a';
        setTimeout(() => {
          button.style.color = originalColor;
        }, 500);
      }
      console.log('已复制股票编码:', stockCode);
    } catch (err) {
      console.error('复制失败:', err);
      // 降级方案：使用传统的复制方法
      const textArea = document.createElement('textarea');
      textArea.value = stockCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      // 降级方案的视觉反馈
      const button = e.target.closest('button');
      if (button) {
        const originalColor = button.style.color;
        button.style.color = '#52c41a';
        setTimeout(() => {
          button.style.color = originalColor;
        }, 500);
      }
    }
  }, [stockCode]);

  // 监控配置相关状态
  const [showWatchConfigModal, setShowWatchConfigModal] = useState(false);
  const [watchConfigForm] = Form.useForm();
  const [watchModelOptions, setWatchModelOptions] = useState([]);
  
  // 监听watchModel字段变化，用于联动显示targetPrice
  const watchModel = Form.useWatch('watchModel', watchConfigForm);

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
    return window.innerHeight > 600 ? window.innerHeight * 0.15 : 100;
    // return 100;
  }


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

  // 检测是否有股票信息和龙虎榜弹窗存在
  const hasModalOpen = useCallback(() => {
    // 直接通过状态变量判断弹窗是否显示
    // lhbTooltip.visible - 龙虎榜弹窗
    // themeTooltip.visible - 题材信息（股票信息）弹窗
    // aiTooltip.visible - AI分析结果弹窗
    return lhbTooltip.visible || themeTooltip.visible || aiTooltip.visible;
  }, [lhbTooltip.visible, themeTooltip.visible, aiTooltip.visible]);

  // 切换股票时重置弹窗状态
  useEffect(() => {
    // 重置龙虎榜tooltip状态
    setLhbTooltip({ visible: false, x: 0, y: 0 });
    isMouseInLhbTooltipRef.current = false;
    
    // 重置题材信息tooltip状态
    setThemeTooltip({ visible: false, x: 0, y: 0 });
    isMouseInTooltipRef.current = false;
    
    // 重置AI分析结果tooltip状态
    setAiTooltip({ visible: false, x: 0, y: 0 });
    isMouseInAiTooltipRef.current = false;
  }, [stockCode]);

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
    let isInKlineArea = false; // 是否在K线图区域内
    let isMultiTouch = false; // 是否为多点触摸操作
    let touchStartCount = 0;  // 触摸开始时的触摸点数量
    
    // 滑动检测参数
    const minSwipeDistance = 80; // 最小滑动距离（增加距离要求）
    const maxHorizontalDistance = 120; // 最大水平滑动距离（垂直滑动时允许的水平偏移）
    const maxSwipeTime = 800; // 最大滑动时间（毫秒）- 快速滑动
    const minSwipeVelocity = 0.5; // 最小滑动速度（像素/毫秒）

    // 触摸开始：记录起始位置和时间
    const handleTouchStart = (e) => {
      const touchCount = e.touches.length;
      touchStartCount = touchCount;
      
      // 多点触摸检测：如果是双指或更多手指，标记为多点触摸
      if (touchCount >= 2) {
        isMultiTouch = true;
        return; // 多点触摸操作时直接返回，不记录坐标
      }
      
      // 单指操作才记录坐标
      isMultiTouch = false;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      
      // 检查触摸是否在K线图区域内
      const klineDom = document.getElementById('kline-chart');
      if (klineDom) {
        const rect = klineDom.getBoundingClientRect();
        isInKlineArea = touchStartX >= rect.left && touchStartX <= rect.right && 
                       touchStartY >= rect.top && touchStartY <= rect.bottom;
      } else {
        isInKlineArea = false;
      }
    };

    // 触摸结束：计算滑动参数并判断是否切换股票
    const handleTouchEnd = (e) => {
      if (!stockList.length) return;
      
      // 组合检测1：多点触摸检测
      if (isMultiTouch || touchStartCount >= 2) {
        isMultiTouch = false;
        return;
      }
      
      // 获取触摸结束位置和时间
      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;
      touchEndTime = Date.now();
      
      // 计算滑动参数
      const deltaX = Math.abs(touchEndX - touchStartX); // 水平滑动距离
      const deltaY = touchEndY - touchStartY;           // 垂直滑动距离
      const deltaTime = touchEndTime - touchStartTime;  // 滑动时间
      const velocity = Math.abs(deltaY) / deltaTime;    // 滑动速度（像素/毫秒）
      
      // 组合检测2：时间间隔检测
      if (deltaTime < 50 || deltaTime > 2000) {
        // 触摸时间过短（可能是双指操作）或过长（可能是长按），忽略
        return;
      }
      
      // 组合检测3：移动距离检测
      if (Math.abs(deltaY) < 40) {
        // 垂直移动距离过小，可能是双指操作，忽略
        return;
      }
      
      // 四重检测：垂直滑动 + 快速滑动 + K线图区域内 + 无弹窗
      const isVerticalSwipe = Math.abs(deltaY) > minSwipeDistance && deltaX < maxHorizontalDistance;
      const isQuickSwipe = deltaTime < maxSwipeTime && velocity > minSwipeVelocity;
      const hasModal = hasModalOpen(); // 检测是否有弹窗存在
      
      // 只有同时满足所有条件时才切换股票
      if (isVerticalSwipe && isQuickSwipe && isInKlineArea && !hasModal) {
        if (deltaY < 0) {
          // 向上快速滑动 - 上一个股票
          setCurrentIndex(idx => (idx < stockList.length - 1 ? idx + 1 : 0));
        } else {
          // 向下快速滑动 - 下一个股票
          setCurrentIndex(idx => (idx > 0 ? idx - 1 : stockList.length - 1));
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
  }, [stockList, hasModalOpen]);

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
    // 优先使用 kLineLatestDate，如果没有则使用 currentStock.date 作为后备
    const targetDate = kLineLatestDate || currentStock.date;
    if (targetDate) {
      setChartEndDate(targetDate);
      chartEndDateHistory.current = [];
    }
  }, [currentStock, kLineLatestDate]);

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
  }, [chartData, selectedMAs, stockDetailLoaded, stockDetail.breakBelowPriceWatch, chartRefreshTrigger]);

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

  const getBrowserHost = () => {
    const { protocol, hostname, port } = window.location;
    
    return `${protocol}//${hostname}`;
  }


  // 计算股票数据功能
  const handleCalculateStockData = useCallback(async () => {
    const currentStockData = stockList[currentIndex] || {};
    const currentStockCode = currentStockData.stockCode;
    const currentDate = chartEndDate || currentStockData.date;

    if (!currentStockCode || !currentDate) {
      message.error('缺少股票代码或日期参数', 2);
      return;
    }

    setIsLoading(true); // 开始计算，设置加载状态

    try {
      const browserHostServer = getBrowserHost()+ ":18888";
      const response = await fetch(`${browserHostServer}/stock/stockDataAnalyserOne/${currentStockCode}/${currentDate}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        message.success('股票数据计算完成！', 2);
        await fetchDetail();
        setChartRefreshTrigger(Date.now());
      } else {
        message.error('计算失败，请稍后重试', 2);
      }
    } catch (error) {
      console.error('计算股票数据失败:', error);
      message.error('网络错误，计算失败', 2);
    } finally {
      setIsLoading(false); // 计算完成，恢复按钮状态
    }
  }, [stockList, currentIndex, chartEndDate, API_HOST, fetchDetail]);

  // 判断是否在交易时间内
  const isInTradingTime = () => {
    const now = new Date();
    const day = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
    
    // 只在工作日（周一到周五）
    if (day === 0 || day === 6) {
      return false;
    }
    
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes; // 转换为分钟数便于比较
    
    // 上午交易时间：9:30 - 11:30
    const morningStart = 9 * 60 + 30; // 9:30
    const morningEnd = 11 * 60 + 30;   // 11:30
    
    // 下午交易时间：13:00 - 15:00
    const afternoonStart = 13 * 60;    // 13:00
    const afternoonEnd = 15 * 60;      // 15:00
    
    return (currentTime >= morningStart && currentTime <= morningEnd) ||
           (currentTime >= afternoonStart && currentTime <= afternoonEnd);
  };

  // 获取最新股价数据
  const fetchLatestStockData = async () => {
    if (!stockCode) return;
    
    try {
      const resp = await fetch(API_HOST + `/stock/getStockKLineLatestData/${stockCode}`);
      if (resp.ok) {
        const latestData = await resp.json();
        setLatestStockData(latestData);
        console.log('最新股价数据已更新:', latestData.closePrice);
      }
    } catch (error) {
      console.error('获取最新股价失败:', error);
    }
  };

  // 启动定时刷新
  const startAutoRefresh = () => {
    // 先清除现有定时器
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }
    
    refreshTimerRef.current = setInterval(() => {
      if(isInTradingTime()){
        fetchLatestStockData();
      }
    }, 10000); // 10秒间隔
  };

  function predictDailyTurnover(currentTR) {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const totalMinutesInDay = hour * 60 + minute;

    // 1. 计算已交易分钟数 (elapsedMinutes)
    let elapsedMinutes = 0;

    // 开盘前: 09:30 之前
    if (totalMinutesInDay < 570) { 
        elapsedMinutes = 0; 
    } 
    // 上午场: 09:30 - 11:30 (共120分钟)
    else if (totalMinutesInDay <= 690) {
        elapsedMinutes = totalMinutesInDay - 570;
    } 
    // 午休时间: 11:30 - 13:00
    else if (totalMinutesInDay < 780) {
        elapsedMinutes = 120;
    } 
    // 下午场: 13:00 - 15:00 (共120分钟)
    else if (totalMinutesInDay <= 900) {
        elapsedMinutes = 120 + (totalMinutesInDay - 780);
    } 
    // 收盘后: 15:00 之后
    else {
        elapsedMinutes = 240;
    }

    if (elapsedMinutes <= 0) return 0;
    if (elapsedMinutes >= 240) return currentTR;

    // 2. 获取成交量累积权重 Ratio(t)
    // 模拟 A 股 U 型成交量曲线 (早盘放量 -> 中间清淡 -> 尾盘回升)
    let weightRatio = 0;

    if (elapsedMinutes <= 30) {
        // 前30分钟权重：占全天约 25%
        weightRatio = (elapsedMinutes / 30) * 0.25;
    } else if (elapsedMinutes <= 120) {
        // 上午剩余90分钟权重：占全天约 30% (累计 55%)
        weightRatio = 0.25 + ((elapsedMinutes - 30) / 90) * 0.30;
    } else if (elapsedMinutes <= 210) {
        // 下午前半段90分钟权重：占全天约 25% (累计 80%)
        weightRatio = 0.55 + ((elapsedMinutes - 120) / 90) * 0.25;
    } else {
        // 最后30分钟权重：占全天约 20% (累计 100%)
        weightRatio = 0.80 + ((elapsedMinutes - 210) / 30) * 0.20;
    }

    // 3. 计算公式: EstimatedTR = CurrentTR / Ratio(t)
    const result = currentTR / weightRatio;
    return parseFloat(result.toFixed(2));
}

  // 停止定时刷新
  const stopAutoRefresh = () => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
      console.log('定时刷新已停止');
    }
  };

  // 检查最新K线日期是否有对应的hummerDates
  const getLatestHammerDate = () => {
    if (!stockDetail.hummerDates || !chartData.length) return null;
    
    const latestKLineDate = chartData[chartData.length - 1]?.date;
    if (!latestKLineDate) return null;
    
    return stockDetail.hummerDates.find(item => item.date === latestKLineDate);
  };

  // 更新Hammer是否有效
  const updateHammerEffective = async (date) => {
    if (!stockCode || !date) return;
    
    try {
      const response = await fetch(API_HOST + `/stock/updateHammerDateIsEffective/${stockCode}/${date}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        message.success('Hammer状态更新成功');
        // 重新获取股票详情以更新数据
        fetchDetail();
      } else {
        message.error('Hammer状态更新失败');
      }
    } catch (error) {
      console.error('更新Hammer状态失败:', error);
      message.error('Hammer状态更新失败');
    }
  };

  useEffect(() => {
    fetchDetail();
    setLatestStockData(null)
    fetchLatestStockData();
    
    // 启动定时刷新
    startAutoRefresh();
    
    // 清理函数：组件卸载或stockCode变化时清理定时器
    return () => {
      stopAutoRefresh();
    };
    // eslint-disable-next-line
  }, [stockCode, currentStock]);

  // 监听页面可见性变化，优化性能
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面隐藏时停止定时刷新
        stopAutoRefresh();
        console.log('页面隐藏，停止定时刷新');
      } else {
        // 页面显示时重启定时刷新
        console.log('页面显示，重启定时刷新');
        startAutoRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line
  }, [stockCode]);

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
        const [date, openPrice, closePrice, minPrice, maxPrice, chenJiaoLiang, zhangDieFu, huanShouLv] = item.split(',');
        return {
          date,
          openPrice: parseFloat(openPrice),
          closePrice: parseFloat(closePrice),
          minPrice: parseFloat(minPrice),
          maxPrice: parseFloat(maxPrice),
          chenJiaoLiang: parseFloat(chenJiaoLiang),
          zhangDieFu: parseFloat(zhangDieFu),
          huanShouLv: parseFloat(huanShouLv)
        };
      });
      const sorted = parsedData.slice().sort((a, b) => a.date.localeCompare(b.date));
      setAllStockData(sorted);
      setOriginalData(sorted);
      
      // 设置最新K线日期
      if (sorted.length > 0) {
        const latestDate = sorted[sorted.length - 1].date;
        setKLineLatestDate(latestDate);
      }
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
    // 优先使用 kLineLatestDate
    const targetDate = kLineLatestDate || currentStock.date;
    if (targetDate) {
      setChartEndDate(targetDate);
    }
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
    const klineData = allStockData.slice(chartStartIdx, chartEndIdx + 1).map(item => {
      // 添加异常判断，确保所有价格字段都存在
      return [
        item.openPrice ?? 0,
        item.closePrice ?? 0,
        item.minPrice ?? 0,
        item.maxPrice ?? 0
      ];
    });
    const volumeData = allStockData.slice(chartStartIdx, chartEndIdx + 1).map(item => item.chenJiaoLiang ?? 0);
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
          const dataItem = allStockData[i - j];
          // 添加异常判断，防止closePrice为undefined
          if (dataItem && typeof dataItem.closePrice !== 'undefined' && !isNaN(dataItem.closePrice)) {
            sum += dataItem.closePrice;
          } else {
            // 如果数据异常，使用前一个有效值或0
            sum += 0;
          }
        }
        // 保持数值类型，避免字符串转换导致的精度问题
        result.push(Number((sum / dayCount).toFixed(2)));
      }
      // 只取区间内部分
      return result.slice(chartStartIdx, chartEndIdx + 1);
    }
    const maList = selectedMAs ? MA_CONFIG.filter(ma => ma.key === selectedMAs).map(ma => ({
      ...ma,
      data: calcMA(ma.key)
    })) : [];
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
        throttle: 100, // 增加节流时间，降低响应速度
        zoomLock: false,
        filterMode: 'filter',
        // 通过自定义事件处理来控制缩放速度
        preventDefaultMouseMove: true
      }
    ];
    // K线图
    const klineChart = echarts.init(document.getElementById('kline-chart'));
    klineChart.group = chartGroupId;
    const latestKlineDate = dates.length > 0 ? dates[dates.length - 1] : null;
    const shouldShowTargetPriceLine = rangeYears > 1 && !!stockDetail.breakBelowPriceWatch && (!stockDetail.breakBelowPriceWatch.startDate || !latestKlineDate || dayjs(stockDetail.breakBelowPriceWatch.startDate).isSameOrBefore(dayjs(latestKlineDate)));
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
        alwaysShowContent: false, // 通过事件控制显示
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
          
          // 添加异常判断，防止currentData为undefined或缺少必要字段
          if (!currentData) {
            return '<div style="color: #fff; font-size: 12px;">数据加载中...</div>';
          }
          
          const zhangDieFu = currentData?.zhangDieFu ?? 0;
          const zhangDieFuColor = zhangDieFu >= 0 ? '#ef232a' : '#14b143'; // 红涨绿跌
          
            return `
             <div style="color: #fff; font-size: 12px; line-height: 1.4;">
               <div style="margin-bottom: 2px;">日期: ${params[0].axisValue || '未知'}</div>
               <div style="margin-bottom: 2px;">开盘: ${currentData.openPrice ?? '--'}</div>
               <div style="margin-bottom: 2px;">收盘: ${currentData.closePrice ?? '--'}</div>
               <div style="margin-bottom: 2px;">最低: ${currentData.minPrice ?? '--'}</div>
               <div style="margin-bottom: 2px;">最高: ${currentData.maxPrice ?? '--'}</div>
               <div style="margin-bottom: 2px;">涨跌幅: <span style="color:${zhangDieFuColor};font-weight:bold">${Number(zhangDieFu).toFixed(2)}%</span></div>
               <div style="margin-bottom: 2px;">换手率: <span style="color:#11d1e4;font-weight:bold">${Number(currentData.huanShouLv).toFixed(2)}%</span></div>
               <div>成交量: ${chenJiaoLiangConvert(currentData.chenJiaoLiang ?? 0)}</div>
               <div>Hammer总长度: ${Number((currentData.maxPrice - currentData.minPrice) / currentData.minPrice).toFixed(2)}</div>
               <div>Hammer实体: ${Number(Math.abs(currentData.closePrice - currentData.openPrice) / Math.min(currentData.closePrice, currentData.openPrice)).toFixed(2)}</div>
             </div>
            `;
        }
      },
      grid: { left: '45px', right: '15px', top: '5%', bottom: '5%' },
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
          interval: function(index, value) {
            if (!dates || dates.length === 0) return false;
            
            // 计算时间跨度
            const firstDate = new Date(dates[0]);
            const lastDate = new Date(dates[dates.length - 1]);
            const timeSpanYears = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
            
            let calculatedInterval = 1;
            
            if (timeSpanYears > 5) {
              // 超过5年数据：显示年份，每年显示一个
              calculatedInterval = Math.ceil(dates.length / Math.min(10, Math.ceil(timeSpanYears)));
            } else if (timeSpanYears >= 2) {
              // 2年到5年数据：每半年显示一个
              calculatedInterval = Math.ceil(dates.length / (timeSpanYears * 2));
            } else {
              // 1年内数据：显示每个月份
              calculatedInterval = Math.ceil(dates.length / 12);
            }
            
            return index % calculatedInterval === 0;
          },
          formatter: function(value, index) {
            if (!value || !dates || dates.length === 0) return value;
            
            // 计算时间跨度
            const firstDate = new Date(dates[0]);
            const lastDate = new Date(dates[dates.length - 1]);
            const timeSpanYears = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
            
            if (timeSpanYears > 5) {
              // 超过5年数据：只显示年份 YYYY
              if (value.length >= 4) {
                return value.slice(0, 4);
              }
            } else if (timeSpanYears >= 2) {
              // 2年到5年数据：显示年月 YYYY-MM
              if (value.length >= 7) {
                return value.slice(0, 7);
              }
            } else {
              // 1年内数据：显示年月 YYYY-MM
              if (value.length >= 7) {
                return value.slice(0, 7);
              }
            }
            
            return value;
          }
        },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
      yAxis: {
        scale: true,
        min: function(value) {
          // 在dataMin基础上减少5%，允许显示负数
          return Number(value.min * 0.95).toFixed(1);
        },
        max: function(value) {
          // 最大值增加适当边距
          return Number(value.max * 1.005).toFixed(1);
        },
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
          },
          // 添加锤子线标记点
          markPoint: {
            tooltip: {
              formatter: function(params) {
                return `锤子线信号<br/>日期: ${params.data.value}`;
              }
            },
            data: stockDetail.hummerDates ? stockDetail.hummerDates
              .filter(item => dates.includes(item.date)) // 只显示当前图表范围内的日期
              .map(item => {
                // 找到对应日期的K线数据，获取最低价
                const dateIndex = dates.indexOf(item.date);
                const klineItem = klineData[dateIndex];
                const minPrice = klineItem ? klineItem[2] : 0; // K线数据格式: [open, close, low, high]

                // 根据effective字段确定颜色
                const color = item.effective === 1 ? '#9932CC' : '#00FFFF'; // 有效为紫色，否则为青色

                // 如果type为'T'，不显示pin形状，只显示文字标签
                const isTType = item.type === 'T';
                const symbol = isTType ? 'circle' : 'pin';
                const symbolSize = isTType ? 1 : 12;
                const symbolRotate = isTType ? 0 : 180;

                return {
                  name: '锤子线',
                  xAxis: item.date,
                  yAxis: minPrice - (minPrice * 0.005), // 显示在最低价下方一点点
                  value: item.date,
                  symbol: symbol,
                  symbolSize: symbolSize,
                  symbolRotate: symbolRotate,
                  itemStyle: {
                    color: color,
                    borderWidth: 0
                  },
                  label: {
                    show: true, // 确保文字标签显示
                    position: 'bottom',
                    distance: 0,
                    fontSize: isTType ? 10 : 8, // T类型稍微大一点，确保可见
                    fontWeight: 'bold',
                    color: 'red',
                    formatter: function(params) {
                      return params.data.type || 'N';
                    }
                  },
                  tooltip: {
                    formatter: function(params) {
                      return `锤子线信号<br/>日期: ${params.data.value}`;
                    }
                  },
                  effective: item.effective,
                  id: item.id,
                  type: item.type // 保存type字段
                };
              }) : []
          }
        },
        ...maList.map(ma => ({
          name: ma.label,
          type: 'line',
          data: ma.data,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 0.8, color: ma.color },
          emphasis: { lineStyle: { width: 0.8 } },
        })),
        // 目标价格虚线
        ...(shouldShowTargetPriceLine ? [{
          name: '目标价格',
          type: 'line',
          data: new Array(dates.length).fill(stockDetail.breakBelowPriceWatch.targetPrice),
          showSymbol: false,
          lineStyle: { 
            width: 0.8, 
            color: 'red', 
            type: 'dashed' 
          },
          emphasis: { lineStyle: { width: 0.8 } },
          tooltip: {
            formatter: function() {
              return `目标价格: ${stockDetail.breakBelowPriceWatch.targetPrice}`;
            }
          }
        }] : []),
        
        // 最后一条数据最低价位线
        ...(chartData.length > 0 ? [{
          name: '当前价位线',
          type: 'line',
          data: new Array(dates.length).fill(chartData[chartData.length - 1].minPrice),
          showSymbol: false,
          lineStyle: { 
            width: 0.8, 
            color: '#444', 
            type: 'dashed' 
          },
          emphasis: { lineStyle: { width: 0.8 } },
          tooltip: {
            formatter: function() {
              return `最低价位: ${chartData[chartData.length - 1].minPrice}`;
            }
          }
        }] : [])
      ]
    };
    klineChart.setOption(klineOption);
    
    
    
    // 自定义缩放速度控制 - 降低到原来的一半
    let lastZoomTime = 0;
    let lastZoomRange = { start: 0, end: 100 };
    
    klineChart.on('dataZoom', (params) => {
      const now = Date.now();
      if (params.batch && params.batch.length > 0) {
        const zoomParams = params.batch[0];
        if (zoomParams.dataZoomId === 'stock-zoom') {
          // 控制缩放频率，降低到原来的一半
          if (now - lastZoomTime > 200) { // 原来可能是100ms，现在改为200ms
            lastZoomTime = now;
            lastZoomRange = { start: zoomParams.start, end: zoomParams.end };
          } else {
            // 如果缩放太频繁，恢复到上次的缩放状态
            klineChart.dispatchAction({
              type: 'dataZoom',
              start: lastZoomRange.start,
              end: lastZoomRange.end
            });
          }
        }
      }
    });
    
    
    // 鼠标双击K线图，立即设置结束日期
    klineChart.getZr().on('dblclick', function (params) {
      // 直接使用ECharts的convertFromPixel方法获取对应的数据索引
      const pointInGrid = klineChart.convertFromPixel({gridIndex: 0}, [params.offsetX, params.offsetY]);
      const xIndex = Math.round(pointInGrid[0]);
      
      // 直接获取对应索引的日期
      if (xIndex >= 0 && xIndex < dates.length) {
        const targetDate = dates[xIndex];
        if (targetDate) {
          // 记录历史
          chartEndDateHistory.current.push(chartEndDateRef.current);
          setChartEndDate(targetDate);
        }
      }
    });
    
    // 重复的mouseout事件处理已移除，统一在上面处理
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
      grid: { left: '45px', right: '10px', top: '5%', bottom: '20%' },
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
          interval: function(index, value) {
            if (!dates || dates.length === 0) return false;
            
            // 计算时间跨度
            const firstDate = new Date(dates[0]);
            const lastDate = new Date(dates[dates.length - 1]);
            const timeSpanYears = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
            
            let calculatedInterval = 1;
            
            if (timeSpanYears > 5) {
              // 超过5年数据：显示年份，每年显示一个
              calculatedInterval = Math.ceil(dates.length / Math.min(10, Math.ceil(timeSpanYears)));
            } else if (timeSpanYears >= 2) {
              // 2年到5年数据：每半年显示一个
              calculatedInterval = Math.ceil(dates.length / (timeSpanYears * 2));
            } else {
              // 1年内数据：显示每个月份
              calculatedInterval = Math.ceil(dates.length / 12);
            }
            
            return index % calculatedInterval === 0;
          },
          formatter: function(value, index) {
            if (!value || !dates || dates.length === 0) return value;
            
            // 计算时间跨度
            const firstDate = new Date(dates[0]);
            const lastDate = new Date(dates[dates.length - 1]);
            const timeSpanYears = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
            
            if (timeSpanYears > 5) {
              // 超过5年数据：只显示年份 YYYY
              if (value.length >= 4) {
                return value.slice(0, 4);
              }
            } else if (timeSpanYears >= 2) {
              // 2年到5年数据：显示年月 YYYY-MM
              if (value.length >= 7) {
                return value.slice(0, 7);
              }
            } else {
              // 1年内数据：显示年月 YYYY-MM
              if (value.length >= 7) {
                return value.slice(0, 7);
              }
            }
            
            return value;
          }
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
              // 添加异常判断，防止d或d.closePrice/d.openPrice为undefined
              if (!d || typeof d.closePrice === 'undefined' || typeof d.openPrice === 'undefined') {
                return GREEN; // 默认返回绿色
              }
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

  // iPad双击切换日期功能
  useEffect(() => {
    const klineDom = document.getElementById('kline-chart');
    if (!klineDom) return;
    
    // iPad双击检测相关变量
    let firstTapTime = 0;
    let firstTapX = 0;
    let firstTapY = 0;
    let doubleTapTimer = null;
    
    const DOUBLE_TAP_DELAY = 300; // 双击检测延迟时间（毫秒）
    const DOUBLE_TAP_DISTANCE = 50; // 双击最大距离（像素）
    
    // iPad触摸开始处理
    const handleTouchStart = (e) => {
      // 记录触摸开始位置和时间
      const touchStartX = e.touches[0].clientX;
      const touchStartY = e.touches[0].clientY;
      
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
          // 执行双击切换日期功能
          const x = touchStartX - rect.left;
          const y = touchStartY - rect.top;
          const chart = echarts.getInstanceByDom(klineDom);
          if (chart) {
            // 直接使用ECharts的convertFromPixel方法获取对应的数据索引
            const pointInGrid = chart.convertFromPixel({gridIndex: 0}, [x, y]);
            const xIndex = Math.round(pointInGrid[0]);
            
            // 直接获取对应索引的日期
            const dates = chartData.map(item => item.date);
            if (xIndex >= 0 && xIndex < dates.length) {
              const targetDate = dates[xIndex];
              if (targetDate) {
                // 记录历史
                chartEndDateHistory.current.push(chartEndDateRef.current);
                setChartEndDate(targetDate);
              }
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
    };
    
    // iPad触摸结束处理
    const handleTouchEnd = (e) => {
      // 双击检测超时清理
      if (doubleTapTimer) {
        clearTimeout(doubleTapTimer);
        doubleTapTimer = null;
      }
    };
    
    // iPad触摸事件监听
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    // 清理函数
    return () => {
      if (doubleTapTimer) {
        clearTimeout(doubleTapTimer);
      }
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [chartData]);


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

  // 添加预购买
  const handleAddPreOrder = async () => {
    try {
      const resp = await fetch(API_HOST + `/stock/addPreOrder/${stockCode}`, {
        method: 'POST'
      });
      if (resp.ok) {
        message.success('添加预购买成功！', 2);
        await fetchDetail();
      } else {
        message.error('添加预购买失败', 2);
      }
    } catch (e) {
      message.error('网络错误，添加预购买失败', 2);
    }
  };

  // 取消预购买
  const handleRemovePreOrder = async () => {
    try {
      const resp = await fetch(API_HOST + `/stock/removePreOrder/${stockCode}`, {
        method: 'POST'
      });
      if (resp.ok) {
        message.success('取消预购买成功！', 2);
        await fetchDetail();
      } else {
        message.error('取消预购买失败', 2);
      }
    } catch (e) {
      message.error('网络错误，取消预购买失败', 2);
    }
  };

  // 更新checkList状态
  const handleUpdateCheckList = async (itemName, newStatus) => {
    if (!stockCode) return;
    
    try {
      // 获取当前的checkListStatus，如果没有则初始化为空对象
      const currentCheckListStatus = stockDetail.checkListStatus || {};
      
      // 更新指定项目的状态
      const updatedCheckListStatus = {
        ...currentCheckListStatus,
        [itemName]: newStatus
      };
      
      const resp = await fetch(API_HOST + `/stock/updateCheckList`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          stockCode: stockCode,
          checkListStatus: updatedCheckListStatus
        })
      });
      
      if (resp.ok) {
        // 更新本地状态
        setStockDetail(prev => ({
          ...prev,
          checkListStatus: updatedCheckListStatus
        }));
      } else {
        message.error('更新失败', 2);
      }
    } catch (e) {
      message.error('网络错误，更新失败', 2);
    }
  };

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
  const formatNumber = (num, length = 3) => {
    if (num === null || num === undefined || num === '') return num;
    const parsed = parseFloat(num);
    if (isNaN(parsed)) return num;
    const decimalPlaces = (parsed.toString().split('.')[1] || '').length;
    return decimalPlaces > length ? parsed.toFixed(length) : parsed.toString();
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
        height: `${windowHeight}px`,
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
          <div style={{marginLeft: '0px', display: 'flex', alignItems: 'flex-start', width: '35vw', maxHeight: '10vh'}}>             
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
                {/* 复制股票编码按钮 */}
                <button
                  onClick={handleCopyStockCode}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '12px',
                    marginLeft: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '2px',
                    fontSize: '10px',
                    color: '#666',
                    opacity: 0.7,
                    transition: 'all 0.2s ease',
                    minWidth: '14px',
                    height: '14px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}
                  title="复制股票编码"
                >
                  <CopyOutlined />
                </button>
                <span style={{ marginLeft: '4px', color: '#aaa', fontSize: '12px' }}>
                    {stockList.length > 0 ? `${currentIndex + 1}/${stockList.length}` : ''}
                </span>
                {/* 题材信息图标 */}
                {stockDetail.themes && stockDetail.themes.length > 0 && (
                  <span 
                    style={{ 
                      marginLeft: 8, 
                      color: '#1890ff', 
                      fontSize: '11px',
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
                {/* AI分析按钮 */}
                {stockDetail.aiAnalysisResult && stockDetail.aiAnalysisResult.content && (
                  <span 
                    style={{ 
                      marginLeft: 8,
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      color: '#1890ff', 
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      // backgroundColor: '#1890ff',
                      // border: '1px solid #1890ff'
                    }}
                    onMouseEnter={handleAiMouseEnter}
                    onMouseLeave={handleAiMouseLeave}
                    title="AI分析结果"
                  >
                    AI
                  </span>
                )}
                {/* 龙虎榜次数 */}
                {stockDetail.lhbs && stockDetail.lhbs.length > 0 && (
                  <span 
                    style={{ 
                      marginLeft: 8, 
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
                    // if (getTagColor(tag)) {
                    //   highlightTags.push(tag);
                    // } else {
                    //   normalTags.push(tag);
                    // }
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
            {/* 最新股价信息 */}
            {latestStockData && (
              <div style={{display: 'flex', flexWrap: 'wrap', marginTop: '2px'}}>
                <span style={{color: TEXT_COLOR}}>
                  最新价: 
                  <span style={{
                    color: latestStockData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                    fontWeight: 'bold',
                    marginLeft: '4px'
                  }}>
                    {latestStockData.closePrice}
                  </span>
                </span>
                
                <span style={{color: TEXT_COLOR}}>
                  涨跌幅: 
                  <span style={{
                    color: latestStockData.zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                    fontWeight: 'bold',
                    marginLeft: '4px'
                  }}>
                    {latestStockData.zhangDieFu >= 0 ? '+' : ''}{latestStockData.zhangDieFu}%
                  </span>
                </span>
                
                <span style={{color: TEXT_COLOR}}>
                  换手率: 
                  <span style={{
                    color: '#11d1e4',
                    fontWeight: 'bold',
                    marginLeft: '4px'
                  }}>{latestStockData.huanShouLv}%</span>
                  |
                  <span style={{
                    color: '#11d1e4',
                    fontWeight: 'bold',
                    marginLeft: '4px'
                  }}>{predictDailyTurnover(latestStockData.huanShouLv)}%</span>
                  |
                  <span style={{
                    color: '#11d1e4',
                    fontWeight: 'bold',
                    marginLeft: '4px'
                  }}>{formatNumber(stockDetail.avgHuanShouLv, 1)}%</span>
                </span>
              </div>
            )}
            <div style={{display: 'flex', flexWrap: 'wrap', fontWeight: 'bold',}}>
              <span style={{color: TEXT_COLOR}}>市值: <span style={{color: '#11d1e4'}}>{stockDetail.totalMarketValue ? Number(stockDetail.totalMarketValue / 100000000).toFixed(2): 0}亿</span></span>
            </div>
            
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
                    <span style={{ color: '#ffd700', fontSize: 12 }}>{(() => {
                      const extraScore = parseFloat(apiScoreResult.extraScore);
                      return formatNumber(extraScore);
                    })()}</span>

                    {(() => {
                      const score = parseFloat(apiScoreResult.score);
                      const extraScore = parseFloat(apiScoreResult.extraScore);
                      const scoreResult = calcScore(chartData);
                      return (
                        <span style={{ color: '#1e90ff', fontSize: 12 }}>（合计：{formatNumber(score + extraScore)}）</span>
                      );
                    })()}

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
                  <div style={{ fontSize: 12, display: 'flex', gap: '16px' }}>
                    {/* 主分数列表 */}
                    <div style={{ flex: 1 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', paddingRight: 6, paddingBottom: 4, fontSize: 10 }}>名称</th>
                            <th style={{ textAlign: 'left', paddingRight: 6, paddingBottom: 4, fontSize: 10 }}>原始值</th>
                            <th style={{ textAlign: 'left', paddingBottom: 4, fontSize: 10 ,fontWeight: 'bold'}}>分数</th>
                            <th style={{ textAlign: 'left', paddingBottom: 4, fontSize: 10 }}>权重</th>
                          </tr>
                        </thead>
                        <tbody>
                          {apiScoreResult.scoreDetail && Object.keys(apiScoreResult.scoreDetail)
                            .filter(key => apiScoreResult.scoreDetail[key]?.type === 'main')
                            .map(key => {
                              const item = apiScoreResult.scoreDetail[key];
                              
                              return (
                                <tr key={key}>
                                  <td style={{ paddingBottom: 2, fontSize: 10 }}>{item?.name}</td>
                                  <td style={{ textAlign: 'left', color: '#1e90ff', paddingBottom: 2, fontSize: 10 }}>{formatNumber(item?.value)}</td>
                                  <td style={{ textAlign: 'left', color: '#ffd700', paddingBottom: 2, fontSize: 10, fontWeight: 'bold' }}>{formatNumber(item?.score)}</td>
                                  <td style={{ textAlign: 'left', paddingBottom: 2, fontSize: 10 }}>{formatNumber(item?.weight)}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* 附加分列表 */}
                    <div style={{ flex: 1 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', paddingRight: 6, paddingBottom: 4, fontSize: 10 }}>名称(附加分)</th>
                            <th style={{ textAlign: 'left', paddingRight: 6, paddingBottom: 4, fontSize: 10 }}>原始值</th>
                            <th style={{ textAlign: 'left', paddingBottom: 4, fontSize: 10, fontWeight: 'bold'}}>分数</th>
                            <th style={{ textAlign: 'left', paddingBottom: 4, fontSize: 10 }}>权重</th>
                          </tr>
                        </thead>
                        <tbody>
                          {apiScoreResult.scoreDetail && Object.keys(apiScoreResult.scoreDetail)
                            .filter(key => apiScoreResult.scoreDetail[key]?.type === 'extra')
                            .map(key => {
                              const item = apiScoreResult.scoreDetail[key];
                              
                              return (
                                <tr key={key}>
                                  <td style={{ paddingBottom: 2, fontSize: 10 }}>{item?.name}</td>
                                  <td style={{ textAlign: 'left', color: '#1e90ff', paddingBottom: 2, fontSize: 10 }}>{formatNumber(item?.value)}</td>
                                  <td style={{ textAlign: 'left', color: '#ffd700', paddingBottom: 2, fontSize: 10, fontWeight: 'bold' }}>{formatNumber(item?.score)}</td>
                                  <td style={{ textAlign: 'left', paddingBottom: 2, fontSize: 10 }}>{formatNumber(item?.weight)}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
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
            height:  `${windowHeight - headerHeight - 16}px`,
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
            background: 'rgba(35,38,58,0.5)',
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
            {/* 计算按钮 */}
            <LoadingButton
              onClick={handleCalculateStockData}
              loading={isLoading}
              loadingText=""
              style={{
                width: '45px',
                height: '20px',
                marginRight: 8,
              }}
              title="计算股票数据"
            >
              计算
            </LoadingButton>

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
                border: hasWatchConfig() ? '2px solid #23b14d' : '1px solid #444',
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
            
            {/* Hammer按钮 - 只在最新K线有对应hummerDates时显示 */}
            {getLatestHammerDate() && (
              <button
                onClick={() => {
                  const latestHammer = getLatestHammerDate();
                  if (latestHammer) {
                    updateHammerEffective(latestHammer.date);
                  }
                }}
                style={{
                  background: '#23263a',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  marginRight: '8px',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.target.style.background = '#2a2f3a';
                  e.target.style.borderColor = '#ff6b35';
                }}
                onMouseOut={e => {
                  e.target.style.background = '#23263a';
                  e.target.style.borderColor = '#444';
                }}
                title="更新Hammer信号有效性"
              >
                Hammer
              </button>
            )}
            
            <span style={{marginRight: 0, color: '#fff'}}>均线:</span>
            <Select
              value={selectedMAs ?? undefined}
              onChange={value => setSelectedMAs(value ?? null)}
              style={{ minWidth: 50, width: 90, height:25, background: '#181c26', color: '#fff', border: 'none' }}
              dropdownStyle={{ background: '#23263a', color: '#fff' }}
              popupClassName="ma-select-dark"
              options={MA_CONFIG.map(ma => ({
                value: ma.key,
                label: <span style={{ color: ma.color }}>{ma.label}</span>
              }))}
              placeholder="选择均线"
              bordered={false}
              size="small"
              allowClear
            />
            <span style={{marginLeft: 1, color: '#fff'}}>区间:</span>
            {[0.5, 1, 3, 5, 10, 20].map(y => (
              <button
                key={y}
                onClick={() => handleRangeChange(y)}
                style={{
                  minWidth: '25px',
                  padding: '2px 2px',
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
                {y === 0.5 ? '半年' : y}
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
              模拟
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
            {/* 预购买操作按钮 */}
            {stockDetail.preOrder ? (
              <button
                onClick={handleRemovePreOrder}
                style={{
                  marginLeft: 4,
                  padding: '2px 2px',
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
                取消预购
              </button>
            ) : (
              <button
                onClick={handleAddPreOrder}
                style={{
                  marginLeft: 4,
                  padding: '2px 2px',
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
                添加预购
              </button>
            )}
            {/* 妖股操作按钮 */}
            {/* 屏蔽妖股按钮--2025-11-08 */}
            {/* {stockDetail.yaoGu ? (
              <button
                onClick={handleRemoveYaogu}
                style={{
                  marginLeft: 4,
                  padding: '2px 2px',
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
                  marginLeft: 4,
                  padding: '2px 2px',
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
            )} */}
            <span style={{marginRight: 0, color: '#fff'}}>收藏:</span>
            <Rate
                count={5}
                value={favoriteStars}
                onChange={stockFavorite}
                allowClear={true}
                style={{ color: '#ffd700', fontSize: 16 }}
            />
          </div>
          
          {/* 购买checkList - 只在preOrder为true时显示，位于工具栏下方 */}
          {(
            <div style={{
              position: 'absolute',
              top: 48,
              right: 10,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: 'rgba(35,38,58,0.5)',
              borderRadius: 6,
              padding: '6px 14px',
              boxShadow: '0 2px 8px #0003',
            }}>
              {CHECK_LIST_ITEMS.map((itemName) => {
                // 确保checkListStatus存在，如果为空则使用空对象
                const checkListStatus = stockDetail.checkListStatus || {};
                // 如果checkListStatus为空或该字段不存在，默认为false
                const isChecked = Boolean(checkListStatus[itemName]);
                
                return (
                  <div 
                    key={itemName}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleUpdateCheckList(itemName, !isChecked)}
                  >
                    {/* 检查项目名 */}
                    <span style={{
                      color: TEXT_COLOR,
                      fontSize: '12px',
                      whiteSpace: 'nowrap'
                    }}>
                      {itemName}:
                    </span>
                    {/* 红绿灯状态 - true显示绿色勾，false显示红色叉 */}
                    <div
                      style={{
                        width: '14px',
                        height: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        cursor: 'pointer'
                      }}
                    >
                      {isChecked ? (
                        // 绿色勾
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M13.5 4.5L6 12L2.5 8.5"
                            stroke={GREEN}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        // 红色叉
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M4 4L12 12M12 4L4 12"
                            stroke={RED}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

          {watchModel === 'BREAK_BELOW_PRICE' && (
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
          )}

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
            maxWidth: '600px',
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
            maxHeight: '500px', 
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
                    要点{index + 1}: {theme.keyClassif}
                  </span>
                  <span style={{ 
                    fontSize: '11px',
                    color: '#999',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    whiteSpace: 'normal',
                    wordWrap: 'break-word',
                    maxWidth: '400px',
                    display: 'inline-block'
                  }}>
                    {theme.keyword}
                  </span>
                </div>
                
                {/* 内容 */}
                <div style={{ 
                  fontSize: '12px', 
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
                    
                    // 将分号替换为带序号的换行符
                    const contentWithLineBreaks = theme.mainpointContent ? 
                      theme.mainpointContent
                        .split(';')
                        .filter(item => item.trim()) // 过滤空内容
                        .map((item, lineIndex) => `${lineIndex + 1}. ${item.trim()}`)
                        .join('<br/>') : '';
                    const highlightedContent = highlightText(contentWithLineBreaks, stockDetail.highLightWords);
                    
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
      
      {/* AI分析结果tooltip */}
      {aiTooltip.visible && stockDetail.aiAnalysisResult && stockDetail.aiAnalysisResult.content && (
        <div 
          style={{
            position: 'fixed',
            left: aiTooltip.x,
            top: aiTooltip.y,
            backgroundColor: BG_COLOR,
            color: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            maxWidth: '600px',
            minWidth: '300px',
            zIndex: 10001,
            border: '1px solid #333',
            fontFamily: 'Arial, sans-serif'
          }}
          onMouseEnter={handleAiTooltipMouseEnter}
          onMouseLeave={handleAiTooltipMouseLeave}
        >
          <div style={{ 
            fontWeight: 'bold',
            marginBottom: '8px',
            color: '#1890ff',
            fontSize: '14px',
            borderBottom: '1px solid #333',
            paddingBottom: '4px'
          }}>
            AI分析结果
          </div>
          <div style={{ 
            fontSize: '12px', 
            color: '#e0e0e0', 
            lineHeight: '1.6',
            maxHeight: '400px',
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            whiteSpace: 'pre-wrap'
          }}>
            <style>
              {`
                div::-webkit-scrollbar {
                  display: none;
                }
              `}
            </style>
            {(() => {
              // 处理markdown内容，移除markdown代码块标记
              let content = stockDetail.aiAnalysisResult.content;
              
              // 移除markdown代码块标记
              content = content.replace(/```markdown\n/g, '').replace(/```\n/g, '');
              
              return (
                <ReactMarkdown
                  components={{
                    // 紧凑的自定义样式
                    h1: ({children}) => (
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: 'bold', 
                        color: '#1890ff', 
                        marginTop: '8px', 
                        marginBottom: '4px' 
                      }}>
                        {children}
                      </div>
                    ),
                    h2: ({children}) => (
                      <div style={{ 
                        fontSize: '13px', 
                        fontWeight: 'bold', 
                        color: '#1890ff', 
                        marginTop: '6px', 
                        marginBottom: '3px' 
                      }}>
                        {children}
                      </div>
                    ),
                    h3: ({children}) => (
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 'bold', 
                        color: '#1890ff', 
                        marginTop: '4px', 
                        marginBottom: '2px' 
                      }}>
                        {children}
                      </div>
                    ),
                    p: ({children}) => (
                      <div style={{ 
                        marginBottom: '4px', 
                        lineHeight: '1.4',
                        fontSize: '12px'
                      }}>
                        {children}
                      </div>
                    ),
                    ul: ({children}) => (
                      <div style={{ 
                        marginLeft: '12px', 
                        marginBottom: '4px' 
                      }}>
                        {children}
                      </div>
                    ),
                    ol: ({children}) => (
                      <div style={{ 
                        marginLeft: '12px', 
                        marginBottom: '4px' 
                      }}>
                        {children}
                      </div>
                    ),
                    li: ({children}) => (
                      <div style={{ 
                        marginBottom: '2px',
                        fontSize: '12px'
                      }}>
                        {children}
                      </div>
                    ),
                    code: ({children}) => (
                      <span style={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                        padding: '1px 3px', 
                        borderRadius: '2px',
                        fontFamily: 'monospace',
                        fontSize: '11px'
                      }}>
                        {children}
                      </span>
                    ),
                    pre: ({children}) => (
                      <div style={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                        padding: '4px', 
                        borderRadius: '3px',
                        marginBottom: '4px',
                        overflow: 'auto',
                        fontSize: '11px'
                      }}>
                        {children}
                      </div>
                    ),
                    blockquote: ({children}) => (
                      <div style={{ 
                        borderLeft: '3px solid #1890ff',
                        paddingLeft: '8px',
                        marginLeft: '8px',
                        marginBottom: '4px',
                        fontStyle: 'italic',
                        color: '#ccc'
                      }}>
                        {children}
                      </div>
                    ),
                    hr: () => (
                      <div style={{ 
                        borderTop: '1px solid #333',
                        margin: '4px 0'
                      }} />
                    )
                  }}
                >
                  {content}
                </ReactMarkdown>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* 顶部提示标签 */}
      <div style={{
        position: 'fixed',
        left: '20px',
        bottom: '5px',
        zIndex: 1000,
        color: 'red',
        fontWeight: 'bold',
        fontSize: '12px',
        fontFamily: 'Arial, sans-serif',
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: 0.7
      }}>
          {Array.isArray(mottoTags) && mottoTags.length > 0 && (() => {
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
                  color: 'red',
                  borderRadius: '12px',
                  padding: '2px 3px',
                  fontSize: '12px',
                  marginRight: '8px',
                  marginBottom: '4px',
                  display: 'inline-block',
                  border: color ? `1px solid ${color}` : '1px solid #444',
                  fontWeight: 'bold',
                }}>{tag}</span>
              );
            };
            
            // 找出高亮标签
            const highlightTags = [];
            const normalTags = [];
            
            mottoTags.forEach(tag => {
              // 如果标签有颜色，则添加到高亮标签中
              // if (getTagColor(tag)) {
              //   highlightTags.push(tag);
              // } else {
              //   normalTags.push(tag);
              // }
              normalTags.push(tag);
            });
            
            // 先渲染高亮标签，再渲染普通标签
            return [
              ...highlightTags.map((tag, idx) => renderTag(tag, idx, true)),
              ...normalTags.map((tag, idx) => renderTag(tag, idx, false))
            ];
          })()}
      </div>
    </>
  );
};

export default StockDetail;