import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import axios from 'axios';
import '../App.css';
import { FixedSizeList as List } from 'react-window';
import SearchModal from './SearchModal';

import { Select, Dropdown, Button, message } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import 'antd/dist/reset.css';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { API_HOST } from '../config/config';

class MutexLock {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  acquire() {
    return new Promise(resolve => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const nextResolver = this.queue.shift();
      nextResolver();
    } else {
      this.locked = false;
    }
  }
}

// 创建一个全局锁实例
const globalLock = new MutexLock();

const StockList = () => {
  const host = API_HOST;

  const MODAL_TYPE_CONFIRM = 'CONFIRM'

  // 股票类型常量
  const STOCK_TYPE_OPTIONS = [
    { label: '主板', value: 'MAIN' },
    { label: '科创', value: 'TECH' },
    { label: '创业板', value: 'GEM' },
    { label: '板块', value: 'BK' },
    { label: '已退市', value: 'ST' }
  ];

  // 状态定义（必须在所有函数之前）
  const [nextClosePriceAnalysis, setNextClosePriceAnalysis] = useState('');

  // API函数定义（必须在事件处理函数之前）
  const addFavorite = useCallback(async (stockCode) => {
    await axios.post(host + '/stock/addFavorite', {
      stockCode: stockCode,
      nextClosePriceAnalysis: nextClosePriceAnalysis
    });
  }, [host, nextClosePriceAnalysis]);

  const removeFavorite = useCallback(async (stockCode) => {
    await axios.post(host + '/stock/removeFavorite/' + stockCode, {});
  }, [host]);

  // 事件处理函数定义（必须在TAB_CONFIG之前）
  const handleNotSupportClick = useCallback(() => {
    alert("不支持点击")
  }, []);

  const handleAddFavoriteClick = useCallback((row) => {
    console.log("add favorite:", row)
    addFavorite(row.stockCode);
    setNextClosePriceAnalysis(null);
  }, [addFavorite, setNextClosePriceAnalysis]);

  const handleRemoveFavoriteClick = useCallback((row) => {
    removeFavorite(row.stockCode)// 显示弹窗
  }, [removeFavorite]);

  // Tab配置常量
  const TAB_CONFIG = useMemo(() => ({
    latestMain: {
      key: 'latestMain',
      label: '主板',
      fieldConfigType: 'simple',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
      }],
      stockTypes: ['MAIN'],
      orderByField: 'score',
      orderRule: 'desc',
      showDateSelector: false // 妖股Tab不显示日期选择器
    },
    latestTechGem: {
      key: 'latestTechGem',
      label: '科创/创业',
      fieldConfigType: 'simple',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
      }],
      stockTypes: ['TECH','GEM'],
      orderByField: 'score',
      orderRule: 'desc',
      showDateSelector: false // 妖股Tab不显示日期选择器
    },
    stockSector: {
      key: 'stockSector',
      label: '板块',
      fieldConfigType: 'stockSector',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
        width: 40
      }],
      stockTypes: ['BK'],
      showDateSelector: false // 妖股Tab不显示日期选择器
    },
    all: {
      key: 'all',
      label: '所有数据',
      fieldConfigType: 'simple',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
      }],
      orderByField: 'stockCode',
      orderRule: 'ASC'
    },
    preOrder: {
      key: 'preOrder',
      label: '预购',
      fieldConfigType: 'preOrder',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
        width: 40
      }],
      stockTypes: ['MAIN','TECH','GEM'],
      showDateSelector: false // 妖股Tab不显示日期选择器
    },
    hammer: {
      key: 'hammer',
      label: 'Hammer',
      fieldConfigType: 'hammer',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
        width: 40
      }],
      stockTypes: ['MAIN'],
      showDateSelector: false // 妖股Tab不显示日期选择器
    },
    possibleHammer: {
      key: 'possibleHammer',
      label: 'PreHammer',
      fieldConfigType: 'hammer',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
        width: 40
      }],
      stockTypes: ['MAIN'],
      showDateSelector: false // 妖股Tab不显示日期选择器
    },
    incrementalDecline : {
      key: 'incrementalDecline',
      label: '增量下跌',
      fieldConfigType: 'simple',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
        width: 40
      }],
      orderByField: 'stockCode',
      orderRule: 'asc'
    },
    favorites: {
      key: 'favorites',
      label: '收藏列表',
      fieldConfigType: 'favorite',
      dateType: 'latest',
      showDateSelector: false,
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "取消收藏",
        handler: handleRemoveFavoriteClick,
        width: 60
      }],
      orderByField: 'stockCode',
      orderRule: 'ASC'
    },
    watched: {
      key: 'watched',
      label: '监控列表',
      fieldConfigType: 'watched',
      showDateSelector: false,
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
        width: 40
      }],
      stockTypes: ['MAIN'],
      orderByField: 'targetPriceIntervalPrecent',
      orderRule: 'ASC'
    },
    // 屏蔽妖股列表
    // yaogu: {
    //   key: 'yaogu',
    //   label: '妖股',
    //   fieldConfigType: 'simple',
    //   operations: [{
    //     modalType: MODAL_TYPE_CONFIRM,
    //     name: "不支持",
    //     handler: handleNotSupportClick,
    //     width: 40
    //   }],
    //   orderByField: 'stockCode',
    //   orderRule: 'ASC',
    //   showDateSelector: false // 妖股Tab不显示日期选择器
    // },
    hammerTest: {
      key: 'hammerTest',
      label: 'TEST',
      fieldConfigType: 'simple',
      operations: [{
        modalType: MODAL_TYPE_CONFIRM,
        name: "收藏",
        handler: handleAddFavoriteClick,
        width: 40
      }],
      stockTypes: ['MAIN'],
      hiddle: true,
      showDateSelector: false // 妖股Tab不显示日期选择器
    }
  }), [handleAddFavoriteClick, handleRemoveFavoriteClick, handleNotSupportClick]);

  // Tab常量（保持向后兼容）
  const TAB_LATEST = TAB_CONFIG.latestMain.key;

  // URL状态管理
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // 控制页签状态
  const [activeTab, setActiveTab] = useState(() => {
    // 尝试从URL恢复Tab状态
    const tabFromUrl = searchParams.get('tab');
    return tabFromUrl || TAB_LATEST;
  });

  // 控制搜索弹窗状态
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  // 表头
  const [stockFieldConfigTypes, setStockFieldConfigTypes] = useState([]);
  const [columns, setColumns] = useState([]);

  // 表格数据
  const [data, setData] = useState([]);
  const [matchedTags, setMatchedTags] = useState([]);
  const [total, setTotal] = useState(0);
  const [riseCount, setRiseCount] = useState(0);
  const [zhangTingCount, setZhangTingCount] = useState(0);

  // 通过ref优化数据卡顿问题
  // 使用useState回到导致组件频繁，通过ref进行优化
  let searchKeyWordTmp = useRef('');

  const [maxWidth, setMaxWidth] = useState(window.width);

  // 重构：统一查询参数状态管理 - 基于缓存机制
  const [queryParams, setQueryParams] = useState(() => {
    // 获取初始Tab
    const tabFromUrl = searchParams.get('tab');
    const initialTab = tabFromUrl || TAB_LATEST;
    
    // 从缓存获取参数，如果没有则使用默认参数
    const initialParams = {
      date: '',
      keywords: '',
      fieldQueries: {},
      stockTypes: [],
      pageIndex: 1,
      pageSize: 5000,
      orderByField: TAB_CONFIG[initialTab]?.orderByField,
      orderRule: TAB_CONFIG[initialTab]?.orderRule || 'asc',
      selectedDates: [],
      stockFieldConfigType: TAB_CONFIG[initialTab]?.fieldConfigType || 'simple'
    };

    console.log("initialParams", initialParams);
    
    return initialParams;
  });

  // 保留一些非查询相关的状态
  const [dates, setDates] = useState([]);
  
  // 导出CSV功能
  const exportToCSV = useCallback(() => {
    if (!data || data.length === 0) {
      alert('没有数据可以导出');
      return;
    }

    // 生成CSV内容
    const csvContent = [
      // CSV头部
      '股票代码,股票名称',
      // 数据行
      ...data.map(row => `"${row.stockCode}","${row.stockName}"`)
    ].join('\n');

    // 生成文件名：StockList+Tab标签+日期.csv
    const currentDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD格式
    const tabLabel = TAB_CONFIG[activeTab]?.label || activeTab;
    const fileName = `StockList${tabLabel}${currentDate}.csv`;

    // 创建Blob并下载
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [data, activeTab, TAB_CONFIG]);

  // 复制股票编码功能
  const copyStockCodes = useCallback(async () => {
    if (!data || data.length === 0) {
      message.warning('没有股票数据可以复制');
      return;
    }

    try {
      // 提取所有股票编码，用逗号分隔
      const stockCodes = data.map(row => row.stockCode).join(',');
      
      // 使用现代 Clipboard API
      await navigator.clipboard.writeText(stockCodes);
      message.success(`已复制 ${data.length} 个股票编码到剪贴板`, 2);
    } catch (err) {
      console.error('复制失败:', err);
      // 降级方案：使用传统的复制方法
      try {
        const stockCodes = data.map(row => row.stockCode).join(',');
        const textArea = document.createElement('textarea');
        textArea.value = stockCodes;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        message.success(`已复制 ${data.length} 个股票编码到剪贴板`, 2);
      } catch (fallbackErr) {
        console.error('降级复制方案也失败:', fallbackErr);
        message.error('复制失败，请重试', 2);
      }
    }
  }, [data]);
  
  // 重构：Tab参数缓存 - 使用普通Map缓存不同Tab的queryParams
  const tabQueryParamCache = useRef(new Map());

  // 重构：统一查询参数更新函数
  const updateQueryParams = useCallback((updates) => {
    setQueryParams(prev => {
      // 如果stockFieldConfigType发生变化，清空fieldQueries
      if (updates.stockFieldConfigType && updates.stockFieldConfigType !== prev.stockFieldConfigType) {
        return {
          ...prev,
          ...updates,
          fieldQueries: {} // 清空fieldQueries
        };
      }
      return { ...prev, ...updates };
    });
  }, []);

  // 重构：保存Tab参数到缓存
  const saveTabParamsToCache = useCallback((tabKey, params) => {
    tabQueryParamCache.current.set(tabKey, { ...params });
  }, []);

  // 重构：URL状态管理函数
  const saveStateToUrl = useCallback((tab, params) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', tab);
    newSearchParams.set('state', encodeURIComponent(JSON.stringify({
      ...params,
      activeTab: tab
    })));
    navigate(`?${newSearchParams.toString()}`, { replace: true });
  }, [searchParams, navigate]);

  // 重构：获取Tab的默认参数
  const getTabDefaultParams = useCallback((tabKey) => {
    const tabConfig = TAB_CONFIG[tabKey];
    return {
      tabName: tabKey,
      date: '',
      keywords: '',
      fieldQueries: {},
      stockTypes: tabConfig?.stockTypes ? [] : [],
      pageIndex: 1,
      pageSize: 5000,
      orderByField: tabConfig?.orderByField,
      orderRule: tabConfig?.orderRule || 'ASC',
      selectedDates: [],
      stockFieldConfigType: tabConfig?.fieldConfigType || 'simple'
    };
  }, [TAB_CONFIG]);

  // 重构：从缓存获取Tab参数
  const getTabParamsFromCache = useCallback((tabKey) => {
    const cachedParams = tabQueryParamCache.current.get(tabKey);
    if (cachedParams) {
      return cachedParams;
    }
    // 如果缓存中没有，返回默认参数
    return getTabDefaultParams(tabKey);
  }, [getTabDefaultParams]);


  // 重构：生成StockDetail链接 - 只传递tab标签
  const generateStockDetailLink = useCallback((row) => {
    return `/stock-detail/${row.stockCode}/${row.date}?tab=${activeTab}`;
  }, [activeTab]);

  const getAllFieldConfigType = useCallback(async () => {
    const response = await axios.get(host + '/stock/stockFieldConfig/allType');
    setStockFieldConfigTypes(response.data);
  }, [host]);

  const getAllDate = useCallback(async () => { 
    const response = await axios.get(host + '/stock/getAllDate');
    const dates = [...response.data];
    // dates.unshift('');
    setDates(dates);
    if (dates.length > 0) {
      // 只在初始化时设置默认日期，避免触发无限循环
      setQueryParams(prev => {
        if (prev.selectedDates.length === 0 && prev.date === '') {
          return {
            ...prev,
            selectedDates: [dates[0]],
            date: dates[0]
          };
        }
        return prev;
      });
    }
  }, [host]);

  const getFieldConfigDetail = useCallback(async () => { 
    axios.get(host + '/stock/stockFieldConfig/' + queryParams.stockFieldConfigType)
    .then(response => {
      setColumns(response.data.map(col => ({
        field: col.field,
        fieldName: col.fieldName,
        colorRules: col.colorRules
      })));

      // 只为支持查询的字段创建查询条件
      const newFieldQueries = {};
      response.data.forEach(field => {
        if (field.supportQuery) {
          newFieldQueries[field.field] = {
            start: field.queryStart === null ? '-100' : field.queryStart,
            end: field.queryEnd === null ? '100' : field.queryEnd,
            fieldName: field.fieldName
          };
        }
      });
      // 直接更新queryParams，避免触发无限循环
      setQueryParams(prev => {
        // 只在fieldQueries真正改变时才更新
        if (JSON.stringify(prev.fieldQueries) !== JSON.stringify(newFieldQueries)) {
          return {
            ...prev,
            fieldQueries: newFieldQueries
          };
        }
        return prev;
      });
    });
  }, [queryParams.stockFieldConfigType, host]);

  const loadInitialData = useCallback(async () => {
    try {
      await getAllFieldConfigType();
      await getAllDate();
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }, [getAllFieldConfigType, getAllDate]);

  const getStockDetail = async (stockCode) => {
    const response = await axios.get(host + '/stock/stockDetail/' + stockCode);
    return response.data;
  };


  // 重构：fetchData函数使用统一查询参数
  const fetchData = useCallback(async () => {
    console.log(activeTab);
    let response;
    
    // 确定要使用的股票类型
    const currentStockTypes = TAB_CONFIG[activeTab]?.stockTypes || queryParams.stockTypes;
    
    if(activeTab === TAB_CONFIG.latestMain.key 
      || activeTab === TAB_CONFIG.latestTechGem.key ) {
      response = await axios.post(host + '/stock/stockDataAnalysisPage', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        date: queryParams.date,
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
        fieldQuery: queryParams.fieldQueries,
        dateType: "latest"
      });
    } else if (activeTab === TAB_CONFIG.stockSector.key) {
      response = await axios.post(host + '/stock/stockDataAnalysisPageCommon', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        tableName: "stock_data_analysis_latest_sector",
        keywords: queryParams.keywords,
      });
    } else if (activeTab === TAB_CONFIG.hammer.key) {
      response = await axios.post(host + '/stock/stockDataAnalysisPageCommon', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        tableName: "stock_data_analysis_latest_hammer",
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
      });
    } else if (activeTab === TAB_CONFIG.possibleHammer.key) {
      response = await axios.post(host + '/stock/stockDataAnalysisPageCommon', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        tableName: "stock_data_analysis_latest_possible_hammer",
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
      });
    } else if (activeTab === TAB_CONFIG.preOrder.key) {
      response = await axios.post(host + '/stock/stockDataAnalysisPageCommon', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        tableName: "stock_data_analysis_pre_order",
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
      });
    } else if (activeTab === TAB_CONFIG.hammerTest.key) {
      response = await axios.post(host + '/stock/stockDataAnalysisPageCommon', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        tableName: "stock_data_analysis_hammer",
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
      });
    } else if(activeTab === TAB_CONFIG.all.key) {
      response = await axios.post(host + '/stock/stockDataAnalysisPage', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        date: queryParams.date,
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
        fieldQuery: queryParams.fieldQueries
      });
    }  else if(activeTab === TAB_CONFIG.favorites.key) {
      response = await axios.post(host + '/stock/stockDataFavoritePage', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        dateType: 'latest',
        date: queryParams.date,
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
        fieldQuery: queryParams.fieldQueries
      });
    } else if (activeTab === TAB_CONFIG.watched.key) {
      response = await axios.post(host + '/stock/stockDataWatchedPage', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
        fieldQuery: queryParams.fieldQueries
      });
    } else if (activeTab === TAB_CONFIG.incrementalDecline.key) {
      response = await axios.post(host + '/stock/stockDataAnalysisPage', {
        pageSize: queryParams.pageSize,
        pageIndex: queryParams.pageIndex,
        date: queryParams.date,
        keywords: queryParams.keywords,
        stockTypes: currentStockTypes,
        orderByField: queryParams.orderByField,
        orderRule: queryParams.orderRule,
        fieldQuery: queryParams.fieldQueries,
        matchedAlgorithm: "INCREMENTAL_DECLINE",
        dateType: "latest"
      });
    }
    
    if (response) {
      const result = {
        records: response.data.records,
        total: response.data.total,
        extInfo: response.data.extInfo
      };
      
      setData(result.records);
      setMatchedTags(result.extInfo?.matchedTags || []);
      setTotal(result.total);
      setRiseCount(result.extInfo?.riseCount || 0);
      setZhangTingCount(result.extInfo?.zhangTingCount || 0);
    }
  }, [queryParams, host]);


  // 重构：监听查询参数变化 - 只由queryParams触发fetchData
  const prevQueryParamsRef = useRef(queryParams);
  
  useEffect(() => {
    // 只在queryParams真正改变时才触发fetchData
    const hasQueryParamsChanged = JSON.stringify(prevQueryParamsRef.current) !== JSON.stringify(queryParams);
    
    if (hasQueryParamsChanged) {
      prevQueryParamsRef.current = queryParams;
      fetchData();
    }
  }, [queryParams, fetchData]);

  /**
   * 根据字段名、行数据、颜色规则，获取单元格背景颜色
   * @param {*} field 字段名
   * @param {*} row 行数据
   * @param {*} colorRules 颜色规则
   * @param {*} isHovered 是否鼠标悬浮
   * @returns 
   */
  const cellColor = (field, row, colorRules, isHovered) => {
    let defaultStyle = getCellColorFromConfig(field, row, colorRules);

    // 鼠标悬浮时，如果默认颜色是白色，则设置背景颜色为灰色，字体加粗
    if (isHovered) {
      let backgroundColor = defaultStyle.backgroundColor;
      if (defaultStyle.backgroundColor === 'white') {
        backgroundColor = '#DCDCDC';
      }
      return {
        backgroundColor: backgroundColor,
        fontWeight: 'bold',
        color: defaultStyle.color,
        fontSize: '13px'
      }
    }
    return defaultStyle;
  }

  /**
   * 根据字段名、行数据、颜色规则，获取单元格背景颜色
   * @param {*} field 字段名
   * @param {*} row 行数据
   * @param {*} colorRules 颜色规则
   * 
   * @returns 
   */
  const getCellColorFromConfig = (field, row, colorRules) => {
    let favorite = row['favorite'];
    let guoQi = row['guoQi'];
    let value = row[field];

    // 收藏着色
    if(field === 'stockCode' && favorite === 1) {
      return {
        backgroundColor: "white",
        color: '#EE7621',
        fontWeight: 'bold'
      };
    }

    // 国企着色
    if(field === 'stockName' && guoQi === 1) {
      return {
        backgroundColor: "white",
        color: "#EE7621"
      };
    }

    // 规则不存在使用默认颜色 
    if (!colorRules || colorRules.length === 0) {
      return {
        backgroundColor: 'white'
      };
    }

    // 匹配规则
    for (const rule of colorRules) {
      if (value >= rule.startValue && value <= rule.endValue) {
        return {
          backgroundColor: rule.color
        };
      }
    }
  
    // 没有匹配到规则使用默认颜色
    return {
      backgroundColor: 'white'
    };
  };

  // 重构：处理表头点击事件
  const handleHeaderClick = (field) => {
    let newOrderRule = 'ASC';
    if (queryParams.orderByField === field && queryParams.orderRule === 'ASC') {
      newOrderRule = 'DESC';
    }
    updateQueryParams({
      orderByField: field,
      orderRule: newOrderRule,
      pageIndex: 1
    });
  };


  // 根据Tab配置生成operations
  const getTabOperations = useCallback((tabKey) => {
    const config = TAB_CONFIG[tabKey];
    if (!config || !config.operations) return [];
    
    return config.operations.map(operation => ({
      ...operation,
      // handler已经是函数，直接使用
    }));
  }, [TAB_CONFIG]);

  const handleSearchModalToggle = () => {
    setSearchModalVisible(!searchModalVisible);
  };

  // 初始化
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 获取表头配置
  useEffect(() => {
    getFieldConfigDetail();
  }, [getFieldConfigDetail]);

  // 重构：页签切换函数 - 基于缓存机制
  const handleTabChange = useCallback((tab) => {
    // 1. 保存当前Tab的查询状态到缓存
    saveTabParamsToCache(activeTab, queryParams);

    // 2. 更新activeTab
    setActiveTab(tab);
    
    // 3. 从缓存获取目标Tab的参数，如果没有则使用默认参数
    const targetParams = getTabParamsFromCache(tab);
    setQueryParams(targetParams);
    searchKeyWordTmp.current.value = (targetParams.keywords);
    
    // 4. 更新表头配置
    updateQueryParams({ stockFieldConfigType: TAB_CONFIG[tab].fieldConfigType });

    
    // 5. 保存状态到URL（只保存tab信息）
    saveStateToUrl(tab, { activeTab: tab });
  }, [activeTab, queryParams, getTabParamsFromCache, TAB_CONFIG, saveStateToUrl, saveTabParamsToCache, updateQueryParams]);
  
  const StockTable = ({ columns, data, operations}) => {
    const ROW_HEIGHT = 24;
    const [dimensions, setDimensions] = useState({
      width: window.innerWidth,
      height: window.innerHeight
    });

    // 监听窗口大小变化
    useEffect(() => {
      const handleResize = () => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        });
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    const OPERATIONS_WIDTH = useMemo(() => {
      if (!operations || operations.length === 0) {
        return 10;
      }
      return 10 + operations.reduce((total, operation) => {
        const operationWidth = operation.width || 40;
        return total + operationWidth;
      }, 0);
    }, [operations]);
    
    const SIDE_BAR_WIDTH = 0; // 不再使用侧边栏

    const PADDING_AND_BORDER = columns.length * 1;
    
    const BASE_WIDTH = (dimensions.width - SIDE_BAR_WIDTH - OPERATIONS_WIDTH - PADDING_AND_BORDER) / columns.length;

    // 使用 useMemo 缓存列宽计算结果
    const columnWidths = useMemo(() => {
      const CHAR_WIDTH = 6.5;
      const PADDING = 16;
      const MIN_WIDTH = BASE_WIDTH;
      const MAX_WIDTH = 200;
      
      const widths = new Map();
      
      columns.forEach(column => {
        let maxWidth = column.fieldName.length * CHAR_WIDTH;
       
        const sampleSize = Math.min(500, data.length);
        for (let i = 0; i < sampleSize; i++) {
          const content = String(data[i][column.field]);
          let contentWidth = content.length * CHAR_WIDTH;
          if(column.field === 'stockName') {
            contentWidth = content.length * 8;
          }
          maxWidth = Math.max(maxWidth, contentWidth);
        }
        
        setMaxWidth(maxWidth);

        widths.set(
          column.field,
          Math.min(Math.max(maxWidth + PADDING, MIN_WIDTH), MAX_WIDTH)
        );
      });
      
      return widths;
    }, [columns, data, BASE_WIDTH]); // 添加 BASE_WIDTH 作为依赖项，以便在窗口大小变化时重新计算

    // 使用 useMemo 缓存总宽度
    const totalWidth = useMemo(() => 
      columns.reduce((acc, col) => acc + columnWidths.get(col.field), 0) + OPERATIONS_WIDTH,
      [columns, columnWidths, OPERATIONS_WIDTH]
    );

    // 添加 TableHeader 组件定义
    const TableHeader = memo(({ columnWidths, totalWidth }) => (
      <div style={{ 
        display: 'flex',
        width: totalWidth,
        backgroundColor: '#DCDCDC',
        borderBottom: '1px black',
        height: ROW_HEIGHT,
        lineHeight: `${ROW_HEIGHT}px`,
        fontWeight: 'bold'
      }}>
        {columns.map(column => (
          <div
            key={column.field}
            style={{
              width: columnWidths.get(column.field),
              padding: '0 4px',
              borderLeft: '1px solid #BEBEBE',
              borderBottom: '1px solid #BEBEBE',
              borderTop: '1px solid #BEBEBE',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              fontWeight: 'bold'
            }}
            onClick={() => handleHeaderClick(column.field)}
            className={queryParams.orderByField === column.field && queryParams.orderRule === 'ASC' ? 'sorted-asc' : (queryParams.orderByField === column.field && queryParams.orderRule === 'DESC' ? 'sorted-desc' : '')}
          >
            {column.fieldName}
          </div>
        ))}
        {operations && operations.length > 0 && (
          <div style={{ 
            width: OPERATIONS_WIDTH,
            padding: '0 4px',
            borderLeft: '1px solid #BEBEBE',
            borderRight: '1px solid #BEBEBE',
            borderBottom: '1px solid #BEBEBE',
            borderTop: '1px solid #BEBEBE',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            fontWeight: 'bold'
          }}>
            操作
          </div>
        )}
      </div>
    ));

    // 使用 memo 优化 Row 组件
    const [hoveredRowIndex, setHoveredRowIndex] = useState(null);
    const [showStockTableModal, setShowStockTableModal] = useState(false);
    const [modalType, setMoalType] = useState('MODAL_TYPE_CONFIRM');
    const [selectedRow, setSelectedRow] = useState('');
    const [tooltipContent, setTooltipContent] = useState('');
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [showTooltip, setShowTooltip] = useState(false);

    const handleIndexClick = async (e, stockCode) => {
      e.stopPropagation(); // 阻止事件冒泡
      try {
        const data = await getStockDetail(stockCode);
        if (data?.tags) {
          setTooltipContent(data);
          setTooltipPosition({ x: e.clientX, y: e.clientY });
          setShowTooltip(true);
        }
      } catch (error) {
        console.error('Error fetching stock detail:', error);
      }
    };

    // 添加 Tooltip 组件
    const Tooltip = ({position}) => (
      <div 
        style={{
          position: 'fixed',
          left: position.x + 10,
          top: position.y + 10,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          maxWidth: '300px',
          zIndex: 1000,
          pointerEvents: 'none'
        }}
      >
        <div style={{fontWeight: 'bold'}}>{tooltipContent.stockCode}:{tooltipContent.stockName}</div>
        <span style={{fontWeight: 'bold'}}>标签: {tooltipContent.tags.join(', ')}</span>
      </div>
    );

    const Row = memo(({ index, style }) => {
      const row = data[index];
      const isHovered = hoveredRowIndex === index;

      return (
        <div 
          style={{
            ...style,
            display: 'flex',
            width: totalWidth,
            height: ROW_HEIGHT,
            lineHeight: `${ROW_HEIGHT}px`
          }}
          onClick={() => setHoveredRowIndex(index)}
        >
          {columns.map(column => (
            <div
              key={column.field}
              style={{
                width: columnWidths.get(column.field),
                padding: '0 4px',
                borderLeft: '1px solid #BEBEBE',
                borderBottom: '1px solid #BEBEBE',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '12px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                cursor: column.field === 'index' ? 'pointer' : 'default',
                ...cellColor(column.field, row, column.colorRules, isHovered)
              }}
              onClick={column.field === 'index' ? (e) => handleIndexClick(e, row.stockCode) : undefined}
            >
              {column.field === 'stockCode' ? (
                <Link
                  to={generateStockDetailLink(row)}
                  state={{ stockList: data }}
                  style={{
                    color: '#1890ff',
                    textDecoration: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {row[column.field]}
                </Link>
              ) : (
                row[column.field]
              )}
            </div>
          ))}
          {operations && operations.length > 0 && (
            <div style={{ 
              width: OPERATIONS_WIDTH,
              padding: '0 4px',
              borderLeft: '1px solid #BEBEBE',
              borderRight: '1px solid #BEBEBE',
              borderBottom: '1px solid #BEBEBE',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              color: 'inherit'
            }}>
              {operations.map((operation, opIndex) => (
                <button 
                  key={opIndex} 
                  onClick={() => {
                    setMoalType(operation.modalType)
                    setSelectedRow(row);
                    setShowStockTableModal(true);
                  }}
                  style={{ 
                    padding: '1px 3px',
                    fontSize: '11px',
                    height: '18px',
                    minWidth: '40px',
                    lineHeight: '1',
                    border: '1px solid #ccc',
                    borderRadius: '2px',
                    backgroundColor: '#f8f8f8',
                    color: 'inherit'
                  }}
                >
                  {operation.name}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    });

    // 计算实际内容高度
    const contentHeight = data.length * ROW_HEIGHT;

    const ConfirmModal = ({title, row, onConfirm, onClose}) => (
      <div style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }}>
        <div style={{ 
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
          minWidth: '300px',
          maxWidth: '80%'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0',
            fontSize: '16px',
            color: '#333'
          }}>
            {title}:
          </h3>
          <div style={{ 
            marginBottom: '24px',
            fontSize: '14px',
            color: '#666',
            wordBreak: 'break-all'
          }}>
            {row['stockName']}
          </div>
          <div style={{ 
            display: 'flex',
            justifyContent: 'center'
          }}>
            <button 
              onClick={onConfirm}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4a90e2',
                color: '#fff',
                border: '10px',
                margin: "10px",
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              确认
            </button>

            <button 
              onClick={onClose}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4a90e2',
                color: '#fff',
                border: '10px',
                margin: "10px",
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );

    // 添加点击其他区域关闭 tooltip 的处理
    useEffect(() => {
      const handleClickOutside = () => {
        setShowTooltip(false);
      };

      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }, []);

    return (
      <div style={{
        width: '100%',
        height: Math.max(contentHeight, dimensions.height),
        position: 'relative'
      }}>
        <TableHeader columnWidths={columnWidths} totalWidth={totalWidth} />
        <List
          height={dimensions.height - ROW_HEIGHT * 2}
          itemCount={data.length}
          itemSize={ROW_HEIGHT}
          width={totalWidth}
          overscanCount={50}
          useIsScrolling
          itemKey={index => data[index].index}
          className="virtual-list"
        >
          {Row}
        </List>

        {showTooltip && (
          <Tooltip
            position={tooltipPosition}
            onClose={() => setShowTooltip(false)}
          />
        )}

        {operations && operations.length > 0 && operations.map((operation, opIndex) => (
          <div key={opIndex}>
            {showStockTableModal && modalType === MODAL_TYPE_CONFIRM && (
              <ConfirmModal 
                title={operation.name}
                row={selectedRow} 
                onConfirm={()=> {
                  operation.handler(selectedRow);
                  setShowStockTableModal(false);
                }}
                onClose={() => {
                  setShowStockTableModal(false);
                }}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  // 处理搜索弹窗的查询
  const handleSearchModalSearch = (values) => {
    // 更新所有状态
    console.log("handleSearchModalSearch", values);
    updateQueryParams({
      stockFieldConfigType: values.stockFieldConfigType,
      date: values.date,
      keywords: values.keywords,
      fieldQueries: values.fieldQueries,
      pageIndex: values.pageIndex,
      pageSize: values.pageSize
    });
  };

  return (
    <div style={{ 
      height: '100vh',
      fontSize:'12px', 
      fontWeight: 'bold',
      overflowY: 'hidden',
      scrollbarWidth: 'none', /* Firefox */
      msOverflowStyle: 'none', /* IE and Edge */
      WebkitScrollbar: { display: 'none' } /* Chrome, Safari, Opera */
    }}>
      <style>
        {`div::-webkit-scrollbar { display: none; }`}
      </style>
      {/* 搜索弹窗 */}
      {/* <SearchModal
        visible={searchModalVisible}
        onCancel={() => setSearchModalVisible(false)}
        stockFieldConfigTypes={stockFieldConfigTypes}
        dates={dates}
        initialValues={{
          stockFieldConfigType,
          date,
          keywords,
          fieldQueries,
          pageIndex,
          pageSize
        }}
        // onSearch={handleSearchModalSearch}
        total={total}
      /> */}
      
      <div style={{ overflowY: 'hidden' }}>
        <div style={{ borderBottom: '1px solid #BEBEBE', marginBottom: '2px'}}>
            {Object.entries(TAB_CONFIG)
              .filter(([tabKey, config]) => !config.hiddle) // 过滤掉hiddle为true的Tab
              .map(([tabKey, config]) => (
              <button
                key={tabKey}
                onClick={() => handleTabChange(tabKey)}
                onDoubleClick={() => fetchData()}
                style={{ marginRight: '2px'}}
                width={maxWidth}
                className={activeTab === tabKey ? 'tab-button tab-button-active' : 'tab-button'}
              >
                {config.label}
              </button>
            ))}

          {/* <Button
            type="primary"
            style={{marginLeft: '10px'}}
            onClick={handleSearchModalToggle}
          >
            高级搜索
          </Button> */}
          {/* 屏蔽表头下拉 */}
          {/* <select 
            value={queryParams.stockFieldConfigType} 
            onChange={(e) => updateQueryParams({ stockFieldConfigType: e.target.value })}
            style={{width: '70px',}}
          >
            {stockFieldConfigTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select> */}

          {/* 日期选择，根据Tab配置决定是否显示 */}
          {TAB_CONFIG[activeTab]?.showDateSelector !== false && (
            <>
              <span style={{ 
                marginLeft: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                height: '24px'
              }}>日期:</span>
              <Select
                mode="multiple"
                value={queryParams.selectedDates}
                onChange={(values) => {
                  updateQueryParams({
                    selectedDates: values,
                    date: values.join(',')
                  });
                }}
                style={{
                  width: '100px',
                  minWidth: '100px',
                  fontSize: '12px',
                  verticalAlign: 'middle',
                  height: '25px'
                }}
                options={dates.map(date => ({
                  label: date,
                  value: date
                }))}
                maxTagCount={1}
                maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                popupMatchSelectWidth={false}
                virtual={true}
                listHeight={512}
                className="custom-select"
                allowClear
                showArrow={false}
                showSearch={false}
              />
            </>
          )}

          {/* 股票类型选择，根据Tab配置决定是否显示 */}
          {!TAB_CONFIG[activeTab]?.stockTypes ? (
            <>
              <span style={{ 
                marginLeft: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                height: '24px'
              }}>股票类型:</span>
              <Select
                mode="multiple"
                value={queryParams.stockTypes}
                onChange={(values) => {
                  updateQueryParams({ stockTypes: values });
                }}
                style={{
                  width: '70px',
                  maxWidth: '70px',
                  fontSize: '12px',
                  verticalAlign: 'middle',
                  height: '25px'
                }}
                options={STOCK_TYPE_OPTIONS}
                maxTagCount={2}
                maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                popupMatchSelectWidth={false}
                virtual={true}
                listHeight={512}
                className="custom-select"
                allowClear
                showArrow={true}
                showSearch={false}
                // placeholder="请选择股票类型"
              />
            </>
          ) : null}

          <span style={{ marginLeft: '10px' }}>关键字:</span>
          <input
            style={{ 
              width: '100px',
              border: '1px solid #ccc',
              borderRadius: '2px',
              padding: '2px 4px',
              outline: 'none',
              fontSize: '13px',
              '&:focus': {
                border: '1px solid #ccc',
                boxShadow: 'none'
              }
            }}
            // 通过ref优化数据卡顿问题
            ref={searchKeyWordTmp}
            onChange={(e) => {}}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // Enter键时触发查询，这里不需要额外操作，因为onChange已经更新了状态
                updateQueryParams({ keywords: searchKeyWordTmp.current.value });
              }
            }}
          />

          <span style={{ marginLeft: '10px' }}>
            总数:{total}
          </span>

          {/* 其它功能下拉菜单 */}
          <Dropdown
            menu={{
              items: [
                {
                  key: 'copy-stock-codes',
                  label: '复制股票编码',
                  onClick: copyStockCodes,
                },
                {
                  key: 'export',
                  label: '导出CSV',
                  onClick: exportToCSV,
                },
                {
                  key: 'market-trend',
                  label: '市场趋势',
                  onClick: () => navigate('/market-trend'),
                },
                {
                  key: 'watch-config',
                  label: '监控配置',
                  onClick: () => navigate('/watch-config'),
                },
              ],
            }}
            trigger={['click']}
          >
            <span
              style={{
                marginLeft: '10px',
                padding: '4px 15px',
                borderRadius: '4px',
                transition: 'background-color 0.3s',
                cursor: 'pointer',
                textDecoration: 'none',
                color: 'inherit',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f5ff'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              其它功能
            </span>
          </Dropdown>

          <span style={{ marginLeft: '10px' }}>标签:</span>
          <span style={{ marginLeft: '10px', color: '#555' }}>
            {matchedTags?.join(', ')}
          </span>

        </div>

        <StockTable
          columns={columns}
          data={data}
          operations={getTabOperations(activeTab)}
        />
      </div>
    </div>
  );
};

export default StockList;