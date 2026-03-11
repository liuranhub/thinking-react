import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Spin, Tag, Input } from 'antd';
import { pinyin } from 'pinyin-pro';
import 'antd/dist/reset.css';
import '../App.css';
import { API_HOST } from '../config/config';
import { get, post } from '../utils/httpClient';
import { renderKlineChart } from '../utils/renderKlineChart';

const BG_COLOR = '#181c26';
const TEXT_COLOR = '#fff';

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
  { tagName: 'AI', color: '#f672ff' },    // 粉紫
  { tagName: '人工智能', color: '#f672ff' },    // 粉紫
  { tagName: '石油', color: '#ff9800' },  // 青色
  { tagName: '机构重仓', color: '#00bcd4' },  // 橙色
];

// 网格配置（默认4宫格）
const GRID_COLS_4 = 2; // 4宫格列数
const GRID_ROWS_4 = 2; // 4宫格行数
const GRID_COUNT_4 = GRID_COLS_4 * GRID_ROWS_4; // 4宫格总网格数

// 9宫格配置
const GRID_COLS_9 = 3; // 9宫格列数
const GRID_ROWS_9 = 3; // 9宫格行数
const GRID_COUNT_9 = GRID_COLS_9 * GRID_ROWS_9; // 9宫格总网格数

// 1支股票模式：四个网格对应的时间范围（年）
// 左上：半年（0.5年），右上：2年，左下：5年，右下：10年
const GRID_RANGES = [0.5, 2, 1, 10];

// 模式类型
const MODE_1_STOCK = '1stock'; // 1支股票，四块区域：左上-半年（不显示交易量）、右上-2年、左下-5年、右下-10年
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

// 网格标题栏组件
const GridHeader = ({
  title,
  stockCode,
  isSelected,
  gridKey,
  onDoubleClick,
  showStockInfo,
  stockDetail,
  latestData,
  scoreData,
  formatNumber,
  hideTags = false // 是否隐藏tags（9宫格模式下默认隐藏）
}) => {
  const headerRef = useRef(null);
  const tagsContainerRef = useRef(null);
  const [visibleTags, setVisibleTags] = useState([]);

  // 获取标签颜色
  const getTagColor = useCallback((tag) => {
    for (const cfg of HIGHLIGHT_TAG_CONFIG) {
      if (tag.includes(cfg.tagName)) {
        return cfg.color;
      }
    }
    return null;
  }, []);

  // 计算可见标签
  useEffect(() => {
    if (!stockDetail?.tags || !Array.isArray(stockDetail.tags) || stockDetail.tags.length === 0) {
      setVisibleTags([]);
      return;
    }

    const calculateVisibleTags = () => {
      if (!headerRef.current || !tagsContainerRef.current) {
        setVisibleTags(stockDetail.tags);
        return;
      }

      const headerWidth = headerRef.current.offsetWidth;
      const firstRow = headerRef.current.querySelector('.grid-header-first-row');
      if (!firstRow) {
        setVisibleTags(stockDetail.tags);
        return;
      }

      const firstRowWidth = firstRow.offsetWidth;
      const padding = 16; // 左右padding
      const availableWidth = headerWidth - padding;

      // 创建一个隐藏的测量容器
      const measureContainer = document.createElement('div');
      measureContainer.style.position = 'absolute';
      measureContainer.style.visibility = 'hidden';
      measureContainer.style.whiteSpace = 'nowrap';
      measureContainer.style.display = 'flex';
      measureContainer.style.gap = '4px';
      measureContainer.style.fontSize = '12px';
      document.body.appendChild(measureContainer);

      const visible = [];
      let currentWidth = 0;

      stockDetail.tags.forEach((tag) => {
        const tagSpan = document.createElement('span');
        tagSpan.textContent = tag;
        tagSpan.style.padding = '0px 4px';
        tagSpan.style.borderRadius = '16px';
        tagSpan.style.marginRight = '4px';
        measureContainer.appendChild(tagSpan);

        const tagWidth = tagSpan.offsetWidth + 4; // 加上marginRight
        if (currentWidth + tagWidth <= availableWidth) {
          visible.push(tag);
          currentWidth += tagWidth;
        } else {
          measureContainer.removeChild(tagSpan);
        }
      });

      document.body.removeChild(measureContainer);
      setVisibleTags(visible);
    };

    // 延迟执行以确保DOM已渲染
    const timer = setTimeout(calculateVisibleTags, 100);

    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleTags();
    });

    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [stockDetail?.tags, showStockInfo, stockCode, stockDetail, latestData, scoreData]);

  // 渲染标签
  const renderTag = useCallback((tag, idx) => {
    const color = getTagColor(tag);
    return (
      <Tag
        key={`${tag}-${idx}`}
        color={color || undefined}
        style={{
          background: color ? color + '22' : BG_COLOR,
          color: color || TEXT_COLOR,
          border: color ? `1px solid ${color}` : '1px solid #444',
          fontWeight: color ? 'bold' : 'normal',
          marginRight: '4px',
          marginTop: '4px',
          marginBottom: '4px',
          fontSize: '12px',
          borderRadius: '16px',
          padding: '0px 4px',
          flexShrink: 0,
        }}
      >
        {tag}
      </Tag>
    );
  }, [getTagColor]);

  return (
    <div 
      ref={headerRef}
      style={{
        padding: '4px 8px',
        fontSize: '14px',
        fontWeight: 'bold',
        color: TEXT_COLOR,
        borderBottom: '1px solid #23263a',
        backgroundColor: '#23263a',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onDoubleClick={onDoubleClick}
      title="双击选中/取消选中此网格"
    >
      {/* 第一行：标题和股票信息 */}
      <div className="grid-header-first-row" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflow: 'hidden',
        minHeight: '20px',
      }}>
        <span className="grid-header-title" style={{ flexShrink: 0 }}>{title}</span>
        {showStockInfo && stockCode && (
          <div className="grid-header-info" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}>
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
          </div>
        )}
      </div>
      
      {/* 第二行：标签（9宫格模式下隐藏） */}
      {showStockInfo && !hideTags && visibleTags.length > 0 && (
        <div 
          ref={tagsContainerRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            overflow: 'hidden',
            marginTop: '2px',
            minHeight: '20px',
          }}
        >
          {visibleTags.map((tag, idx) => renderTag(tag, idx))}
        </div>
      )}
    </div>
  );
};

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
  
  // 是否显示交易量图表（9宫格默认隐藏）
  const [showVolume, setShowVolume] = useState(true);
  
  // 全局图表结束日期（用于双击K线切换日期）
  const [chartEndDate, setChartEndDate] = useState(null);
  
  // 当切换到9宫格时，默认隐藏交易量
  useEffect(() => {
    if (mode === MODE_9_STOCK) {
      setShowVolume(false);
    } else {
      // 切换到其他模式时，恢复显示交易量
      setShowVolume(true);
    }
  }, [mode]);
  
  // 切换股票或模式时，重置选择的日期
  useEffect(() => {
    setChartEndDate(null);
  }, [mode, baseIndex]);
  
  // 重置按钮事件
  const handleResetChartEndDate = () => {
    // 重置到null（使用最新日期）
    setChartEndDate(null);
  };
  
  // 选中的网格标识（格式：'gridIndex' 或 'stockCode-rangeYears'）
  const [selectedGrid, setSelectedGrid] = useState(null);
  
  // 股票列表搜索关键词
  const [stockListSearchKeyword, setStockListSearchKeyword] = useState('');
  
  // 左侧股票列表宽度
  const [stockListWidth, setStockListWidth] = useState(180);
  
  // 股票列表滚动容器引用
  const stockListScrollRef = useRef(null);
  
  // 去除拼音声调
  const removeTone = useCallback((s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), []);
  
  // 当 baseIndex 变化时，滚动到第一个显示的股票
  useEffect(() => {
    if (stockListScrollRef.current && baseIndex >= 0 && stockList.length > 0) {
      // 找到第一个显示的股票代码
      let targetStockCode = null;
      if (mode === MODE_1_STOCK) {
        targetStockCode = stockList[baseIndex]?.stockCode;
      } else if (mode === MODE_2_STOCK) {
        targetStockCode = stockList[baseIndex]?.stockCode;
      } else if (mode === MODE_4_STOCK) {
        targetStockCode = stockList[baseIndex]?.stockCode;
      } else if (mode === MODE_9_STOCK) {
        targetStockCode = stockList[baseIndex]?.stockCode;
      }
      
      if (targetStockCode) {
        // 延迟执行，确保DOM已更新
        setTimeout(() => {
          const container = stockListScrollRef.current;
          if (!container) return;
          
          // 找到对应的股票项
          const targetElement = container.querySelector(`[data-stock-code="${targetStockCode}"]`);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    }
  }, [baseIndex, mode, stockList]);
  
  // 过滤股票列表（支持编码、股票名、拼音搜索）
  const filteredStockList = useMemo(() => {
    if (!stockListSearchKeyword.trim()) {
      return stockList;
    }
    
    const keyword = stockListSearchKeyword.toLowerCase().trim();
    
    return stockList.filter(stock => {
      // 股票代码匹配
      if (stock.stockCode && stock.stockCode.toLowerCase().includes(keyword)) {
        return true;
      }
      
      // 股票名称匹配
      if (stock.stockName && stock.stockName.toLowerCase().includes(keyword)) {
        return true;
      }
      
      // 拼音匹配
      if (stock.stockName) {
        try {
          const arr = pinyin(stock.stockName, { pattern: 'first', type: 'array' });
          const joined = arr.join('');
          const noTone = removeTone(joined);
          const pinyinStr = noTone.replace(/[^a-z]/gi, '').toLowerCase();
          if (pinyinStr.includes(keyword)) {
            return true;
          }
        } catch (e) {
          // 拼音转换失败，忽略
        }
      }
      
      return false;
    });
  }, [stockList, stockListSearchKeyword, removeTone]);
  
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
  
  // 切换股票后，自动发送第一支股票代码给后端
  useEffect(() => {
    if (stockList.length > 0 && baseIndex >= 0 && baseIndex < stockList.length) {
      // 获取第一支股票的代码（根据模式不同，第一支股票都是 stockList[baseIndex]）
      const firstStock = stockList[baseIndex];
      if (firstStock && firstStock.stockCode) {
        sendSelectStockCode(firstStock.stockCode);
      }
    }
  }, [baseIndex, mode, stockList, sendSelectStockCode]);
  
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

  // 设置页面标题
  useEffect(() => {
    document.title = '网格视图';
  }, []);

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

  // 键盘上下键切换股票（统一使用 baseIndex，支持循环）
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!stockList.length) return;
      if (e.key === 'ArrowUp') {
        if (mode === MODE_1_STOCK) {
          setBaseIndex(idx => (idx > 0 ? idx - 1 : stockList.length - 1));
        } else if (mode === MODE_2_STOCK) {
          setBaseIndex(idx => {
            if (idx >= 2) {
              return idx - 2;
            } else {
              // 循环到末尾，找到最后一个有效的起始位置
              const remainder = stockList.length % 2;
              return stockList.length - (remainder === 0 ? 2 : remainder);
            }
          });
        } else if (mode === MODE_4_STOCK) {
          setBaseIndex(idx => {
            if (idx >= GRID_COUNT_4) {
              return idx - GRID_COUNT_4;
            } else {
              // 循环到末尾，找到最后一个有效的起始位置
              const remainder = stockList.length % GRID_COUNT_4;
              return stockList.length - (remainder === 0 ? GRID_COUNT_4 : remainder);
            }
          });
        } else if (mode === MODE_9_STOCK) {
          setBaseIndex(idx => {
            if (idx >= GRID_COUNT_9) {
              return idx - GRID_COUNT_9;
            } else {
              // 循环到末尾，找到最后一个有效的起始位置
              const remainder = stockList.length % GRID_COUNT_9;
              return stockList.length - (remainder === 0 ? GRID_COUNT_9 : remainder);
            }
          });
        }
      }
      if (e.key === 'ArrowDown') {
        if (mode === MODE_1_STOCK) {
          setBaseIndex(idx => (idx < stockList.length - 1 ? idx + 1 : 0));
        } else if (mode === MODE_2_STOCK) {
          setBaseIndex(idx => {
            const nextIdx = idx + 2;
            return nextIdx < stockList.length ? nextIdx : 0;
          });
        } else if (mode === MODE_4_STOCK) {
          setBaseIndex(idx => {
            const nextIdx = idx + GRID_COUNT_4;
            return nextIdx < stockList.length ? nextIdx : 0;
          });
        } else if (mode === MODE_9_STOCK) {
          setBaseIndex(idx => {
            const nextIdx = idx + GRID_COUNT_9;
            return nextIdx < stockList.length ? nextIdx : 0;
          });
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
      // 如果设置了 chartEndDate，需要重新计算数据范围
      if (chartEndDate) {
        const allDates = stockData.allStockData.map(item => item.date);
        if (allDates.includes(chartEndDate)) {
          // 从 chartEndDate 往前推 years 的时间范围
          const minDate = allDates[0];
          const startDate = getDateNDaysAgo(chartEndDate, years);
          const chartStartDate = startDate < minDate ? minDate : startDate;
          return stockData.allStockData.filter(item => item.date >= chartStartDate && item.date <= chartEndDate);
        }
      }
      return stockData.chartData[years];
    }

    // 如果缓存中没有，从 allStockData 计算
    const allDates = stockData.allStockData.map(item => item.date);
    // 如果设置了 chartEndDate，使用它；否则使用最新日期
    const maxDate = chartEndDate && allDates.includes(chartEndDate) ? chartEndDate : allDates[allDates.length - 1];
    const minDate = allDates[0];
    const startDate = getDateNDaysAgo(maxDate, years);
    const chartStartDate = startDate < minDate ? minDate : startDate;
    const filtered = stockData.allStockData.filter(item => item.date >= chartStartDate && item.date <= maxDate);

    return filtered;
  };

  // 获取股票详情数据（每次调用都重新获取，不做缓存）
  const fetchStockDetail = async (stockCode) => {
    try {
      const detail = await get(API_HOST + `/stock/stockDetail/${stockCode}`);
      if (detail) {
        setStockDetails(prev => ({
          ...prev,
          [stockCode]: detail
        }));
        
        // 从detail接口的totalScore中获取分数，设置到stockScoresMap
        if (detail.totalScore !== undefined && detail.totalScore !== null) {
          setStockScoresMap(prev => ({
            ...prev,
            [stockCode]: {
              score: detail.totalScore || 0,
              // extraScore不设置，因为totalScore是总分，不需要额外分数
              totalScore: detail.totalScore
            }
          }));
        }
      }
    } catch (err) {
      console.error('获取股票详情失败:', err);
    }
  };

  // 获取最新股价数据（每次调用都重新获取，不做缓存）
  const fetchLatestStockData = async (stockCode) => {
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

  // 获取股票分数（已废弃，改为从stockDetail接口的totalScore中获取）
  // const fetchStockScore = async (stockCode) => {
  //   // 此函数已不再使用，分数从stockDetail接口的totalScore字段获取
  // };

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
      
      // 清空当前股票的缓存数据，强制重新获取
      setStocksData(prev => {
        const newData = { ...prev };
        stockCodes.forEach(code => {
          // 清空该股票的数据，保留其他股票的数据
          delete newData[code];
        });
        return newData;
      });
      
      // 清空股票详情和最新数据的缓存
      setStockDetails(prev => {
        const newData = { ...prev };
        stockCodes.forEach(code => {
          delete newData[code];
        });
        return newData;
      });
      
      setLatestStockDataMap(prev => {
        const newData = { ...prev };
        stockCodes.forEach(code => {
          delete newData[code];
        });
        return newData;
      });
      
      setStockScoresMap(prev => {
        const newData = { ...prev };
        stockCodes.forEach(code => {
          delete newData[code];
        });
        return newData;
      });
      
      // 使用批量接口获取K线数据（每次都重新获取）
      fetchStockDataBatch(stockCodes);
      
      // 并行加载详情和最新数据（每次都重新获取）
      stockCodes.forEach(stockCode => {
        fetchStockDetail(stockCode);
        // 9宫格模式下不需要调用getStockKLineLatestData接口
        if (mode !== MODE_9_STOCK) {
          fetchLatestStockData(stockCode);
        }
      });
    }
    // 注意：不将 stocksData、stockDetails、latestStockDataMap 作为依赖项，避免无限循环
    // 只在 mode、currentStock、baseIndex 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentStock, baseIndex, fetchStockDataBatch]);

  // 当 stocksData 加载完成后，自动获取分数（已移除，分数从stockDetail接口的totalScore中获取）
  // useEffect(() => {
  //   // 此useEffect已不再使用，分数在fetchStockDetail中从totalScore字段获取
  // }, [mode, currentStock, baseIndex, stocksData]);

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
      // 如果设置了 chartEndDate，使用它；否则使用最新日期
      const maxDate = chartEndDate && allDates.includes(chartEndDate) ? chartEndDate : allDates[allDates.length - 1];
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
        // 如果设置了 chartEndDate，需要重新计算数据范围
        if (chartEndDate) {
          const allDates = allStockData.map(item => item.date);
          if (allDates.includes(chartEndDate)) {
            // 从 chartEndDate 往前推 rangeYears 的时间范围
            const minDate = allDates[0];
            const startDate = getDateNDaysAgo(chartEndDate, rangeYears);
            const chartStartDate = startDate < minDate ? minDate : startDate;
            chartData = allStockData.filter(item => item.date >= chartStartDate && item.date <= chartEndDate);
          } else {
            chartData = stockData.chartData;
          }
        } else {
          chartData = stockData.chartData;
        }
      } else {
        // 如果 chartData 不存在或不是数组，从 allStockData 计算
        const allDates = allStockData.map(item => item.date);
        // 如果设置了 chartEndDate，使用它；否则使用最新日期
        const maxDate = chartEndDate && allDates.includes(chartEndDate) ? chartEndDate : allDates[allDates.length - 1];
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
        // 如果设置了 chartEndDate，需要重新计算数据范围
        if (chartEndDate) {
          const allDates = allStockData.map(item => item.date);
          if (allDates.includes(chartEndDate)) {
            // 从 chartEndDate 往前推 rangeYears9 的时间范围
            const minDate = allDates[0];
            const startDate = getDateNDaysAgo(chartEndDate, rangeYears9);
            const chartStartDate = startDate < minDate ? minDate : startDate;
            chartData = allStockData.filter(item => item.date >= chartStartDate && item.date <= chartEndDate);
          } else {
            chartData = stockData.chartData;
          }
        } else {
          chartData = stockData.chartData;
        }
      } else {
        // 如果 chartData 不存在或不是数组，从 allStockData 计算
        const allDates = allStockData.map(item => item.date);
        // 如果设置了 chartEndDate，使用它；否则使用最新日期
        const maxDate = chartEndDate && allDates.includes(chartEndDate) ? chartEndDate : allDates[allDates.length - 1];
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
    
    if (!klineDom) {
      // DOM 元素不存在，延迟重试
      setTimeout(() => {
        renderGridCharts(stock, gridIndex, rangeYearsParam);
      }, 200);
      return;
    }
    
    // 对于 MODE_1_STOCK 的第一个网格（index 0），不显示交易量，volumeDom 可以为空
    const isFirstGridNoVolume = mode === MODE_1_STOCK && gridIndex === 0;
    
    // 如果隐藏交易量或第一个网格，volumeDom 可以为空
    if ((!showVolume || isFirstGridNoVolume) && !volumeDom) {
      // 继续执行，只渲染 K 线图
    } else if (showVolume && !isFirstGridNoVolume && !volumeDom) {
      // 需要显示交易量但 DOM 不存在，延迟重试
      setTimeout(() => {
        renderGridCharts(stock, gridIndex, rangeYearsParam);
      }, 200);
      return;
    }

    const chartKey = mode === MODE_1_STOCK ? `${stockCode}-${rangeYearsParam}` : `${stockCode}-${gridIndex}`;
    const stockDetail = stockDetails[stockCode] || null;
    
    // 如果图表已存在，先清理
    if (chartsRef.current[chartKey]) {
      const existingGroup = chartsRef.current[chartKey];
      if (existingGroup.cleanup) {
        existingGroup.cleanup();
      }
    }
    
    // 对于 MODE_1_STOCK 的第一个网格（index 0），不显示交易量
    const shouldShowVolumeForThisGrid = mode === MODE_1_STOCK && gridIndex === 0 
      ? false 
      : (showVolume ? volumeDom !== null : false);
    
    // 双击K线切换日期的回调函数
    const handleDateChange = (date) => {
      if (date) {
        setChartEndDate(date);
      }
    };
    
    const chartResult = renderKlineChart({
      klineDom,
      volumeDom: shouldShowVolumeForThisGrid ? volumeDom : null,
      allStockData,
      chartData,
      chartKey,
      gridIndex,
      chartsRef,
      stockDetail,
      onDateChange: handleDateChange,
      hideXAxisLabel: mode === MODE_9_STOCK && !showVolume // 9宫格模式且隐藏交易量时，隐藏X轴标签
    });
    
    // 保存 cleanup 函数和图表实例
    if (chartResult) {
      chartsRef.current[chartKey] = {
        ...chartsRef.current[chartKey],
        cleanup: chartResult.cleanup,
        klineChart: chartResult.charts?.klineChart,
        volumeChart: chartResult.charts?.volumeChart
      };
    }
    
    // 渲染后立即resize，确保图表铺满容器
    setTimeout(() => {
      const chartGroup = chartsRef.current[chartKey];
      if (chartGroup && chartGroup.klineChart) {
        chartGroup.klineChart.resize();
      }
      if (chartGroup && chartGroup.volumeChart) {
        chartGroup.volumeChart.resize();
      }
    }, 150);
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

    // 延迟渲染，确保DOM完全更新后再渲染图表
    const renderTimer = setTimeout(() => {
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
            }, 100 * (index + 1));
          }
        });
      } else if (mode === MODE_4_STOCK) {
        const currentStocks = getCurrentStocks4();
        currentStocks.forEach((stock, index) => {
          if (stock?.stockCode) {
            setTimeout(() => {
              renderGridCharts(stock, index);
            }, 100 * (index + 1));
          }
        });
      } else if (mode === MODE_9_STOCK) {
        const currentStocks = getCurrentStocks9();
        currentStocks.forEach((stock, index) => {
          if (stock?.stockCode) {
            setTimeout(() => {
              renderGridCharts(stock, index);
            }, 100 * (index + 1));
          }
        });
      }
    }, 200); // 增加延迟，确保DOM完全更新

    return () => {
      clearTimeout(renderTimer);
    };
  }, [mode, stocksData, currentStock, baseIndex, rangeYearsTop, rangeYearsBottom, rangeYears, rangeYears9, stockDetails, showVolume, chartEndDate]);

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
            <GridHeader
              title={index === 0 ? '半年K线图' : `${rangeYears}年K线图`}
              stockCode={stockCode}
              isSelected={isSelected}
              gridKey={gridKey}
              onDoubleClick={() => {
                const newSelected = isSelected ? null : gridKey;
                setSelectedGrid(newSelected);
                // 如果选中了网格，发送选中消息给后端
                if (newSelected && stockCode) {
                  sendSelectStockCode(stockCode);
                }
              }}
              showStockInfo={false}
              stockDetail={stockDetails[stockCode]}
              latestData={latestStockDataMap[stockCode]}
              scoreData={stockScoresMap[stockCode]}
              formatNumber={formatNumber}
            />
            <div style={{ flex: (index === 0 || !showVolume) ? '100%' : '70%', position: 'relative' }}>
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
            {showVolume && index !== 0 && (
              <div style={{ flex: '30%', position: 'relative' }}>
                <div id={`volume-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
              </div>
            )}
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
            <GridHeader
              title={`${stock?.stockName || '--'} (${stockCode || '--'})`}
              stockCode={stockCode}
              isSelected={isSelected}
              gridKey={gridKey}
              onDoubleClick={() => {
                const newSelected = isSelected ? null : gridKey;
                setSelectedGrid(newSelected);
                // 如果选中了网格，发送选中消息给后端
                if (newSelected && stockCode) {
                  sendSelectStockCode(stockCode);
                }
              }}
              showStockInfo={showStockInfo}
              stockDetail={stockDetails[stockCode]}
              latestData={latestStockDataMap[stockCode]}
              scoreData={stockScoresMap[stockCode]}
              formatNumber={formatNumber}
            />
            <div style={{ flex: showVolume ? '70%' : '100%', position: 'relative' }}>
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
            {showVolume && (
              <div style={{ flex: '30%', position: 'relative' }}>
                <div id={`volume-chart-${gridIndex}`} style={{ width: '100%', height: '100%' }}></div>
              </div>
            )}
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
            <GridHeader
              title={`${stock?.stockName || '--'} (${stockCode || '--'})`}
              stockCode={stockCode}
              isSelected={isSelected}
              gridKey={gridKey}
              onDoubleClick={() => {
                const newSelected = isSelected ? null : gridKey;
                setSelectedGrid(newSelected);
                // 如果选中了网格，发送选中消息给后端
                if (newSelected && stockCode) {
                  sendSelectStockCode(stockCode);
                }
              }}
              showStockInfo={showStockInfo}
              stockDetail={stockDetails[stockCode]}
              latestData={latestStockDataMap[stockCode]}
              scoreData={stockScoresMap[stockCode]}
              formatNumber={formatNumber}
            />
            <div style={{ flex: showVolume ? '70%' : '100%', position: 'relative' }}>
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
            {showVolume && (
              <div style={{ flex: '30%', position: 'relative' }}>
                <div id={`volume-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
              </div>
            )}
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
            <GridHeader
              title={`${stock?.stockName || '--'} (${stockCode || '--'})`}
              stockCode={stockCode}
              isSelected={isSelected}
              gridKey={gridKey}
              onDoubleClick={() => {
                const newSelected = isSelected ? null : gridKey;
                setSelectedGrid(newSelected);
                // 如果选中了网格，发送选中消息给后端
                if (newSelected && stockCode) {
                  sendSelectStockCode(stockCode);
                }
              }}
              showStockInfo={showStockInfo}
              stockDetail={stockDetails[stockCode]}
              latestData={latestStockDataMap[stockCode]}
              scoreData={stockScoresMap[stockCode]}
              formatNumber={formatNumber}
              hideTags={true} // 9宫格模式下隐藏tags
            />
            <div style={{ flex: showVolume ? '80%' : '100%', position: 'relative' }}>
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
            {showVolume && (
              <div style={{ flex: '20%', position: 'relative' }}>
                <div id={`volume-chart-${index}`} style={{ width: '100%', height: '100%' }}></div>
              </div>
            )}
          </div>
        );
      });
    }
    return null;
  };

  return (
    <div 
      className="stock-detail-grid"
      style={{
        padding: 0,
        margin: 0,
        backgroundColor: BG_COLOR,
        color: TEXT_COLOR,
        height: `${windowHeight}px`,
        width: '100vw',
        overflow: 'hidden',
        fontSize: '14px',
        display: 'flex',
        flexDirection: 'row',
      }}>
      {/* 左侧股票列表 */}
      <div style={{
        width: `${stockListWidth}px`,
        backgroundColor: BG_COLOR,
        borderRight: '1px solid #23263a',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* 搜索框 */}
        <div style={{
          padding: '12px',
          borderBottom: '1px solid #23263a',
          backgroundColor: BG_COLOR,
        }}>
          <Input
            placeholder="搜索股票（编码/名称/拼音）"
            value={stockListSearchKeyword}
            onChange={(e) => setStockListSearchKeyword(e.target.value)}
            style={{
              backgroundColor: '#181c26',
              border: '1px solid #444',
              color: TEXT_COLOR,
              fontSize: '13px',
            }}
            allowClear
          />
        </div>
        
        {/* 股票列表 */}
        <div 
          ref={stockListScrollRef}
          className="stock-list-scrollable"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '4px 0',
          }}
        >
          {filteredStockList.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '50px 20px', 
              color: '#888',
              fontSize: '13px',
            }}>
              {stockListSearchKeyword ? '未找到匹配的股票' : '暂无股票数据'}
            </div>
          ) : (
            filteredStockList.map((stock, filteredIndex) => {
              const stockCode = stock.stockCode;
              // 找到该股票在原始 stockList 中的索引
              const originalIndex = stockList.findIndex(s => s.stockCode === stockCode);
              
              // 判断是否是当前显示的股票
              let isCurrentStock = false;
              if (originalIndex >= 0) {
                if (mode === MODE_1_STOCK) {
                  isCurrentStock = baseIndex === originalIndex;
                } else if (mode === MODE_2_STOCK) {
                  isCurrentStock = originalIndex === baseIndex || originalIndex === baseIndex + 1;
                } else if (mode === MODE_4_STOCK) {
                  isCurrentStock = originalIndex >= baseIndex && originalIndex < baseIndex + GRID_COUNT_4;
                } else if (mode === MODE_9_STOCK) {
                  isCurrentStock = originalIndex >= baseIndex && originalIndex < baseIndex + GRID_COUNT_9;
                }
              }
              
              const latestData = latestStockDataMap[stockCode];
              const scoreData = stockScoresMap[stockCode];
              
              return (
                <div
                  key={stockCode}
                  data-stock-code={stockCode}
                  style={{
                    padding: '8px 10px',
                    fontSize: '13px',
                    borderBottom: '1px solid #181c26',
                    backgroundColor: isCurrentStock ? '#1e90ff22' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    borderLeft: isCurrentStock ? '3px solid #1e90ff' : '3px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrentStock) {
                      e.currentTarget.style.backgroundColor = '#23263a';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrentStock) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                  onClick={() => {
                    // 切换到从选择的股票开始显示
                    if (originalIndex >= 0) {
                      setBaseIndex(originalIndex);
                      setStockListSearchKeyword(''); // 清空搜索关键词
                    }
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ 
                      fontWeight: 'bold', 
                      color: TEXT_COLOR,
                      fontSize: '13px',
                    }}>
                      {stock.stockName || '--'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '11px', 
                    color: '#888',
                    marginTop: '2px',
                  }}>
                    {stockCode}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* 右侧内容区域 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
      {/* 顶部工具栏 */}
      <div style={{
        padding: '8px 20px',
        backgroundColor: BG_COLOR,
        minHeight: `${headerHeight}px`,
        display: 'flex',
        flexDirection: 'column',
        borderBottom: '1px solid #23263a',
      }}>
        {/* 第一行：模式信息和区间选择 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            {mode === MODE_1_STOCK && (
              <>
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>
                  {currentStock?.stockName || '--'} ({currentStock?.stockCode || '--'})
                </span>
                {currentStock?.stockCode && (
                  <>
                    {stockDetails[currentStock.stockCode]?.outstandingMarketValue && (
                      <span style={{ color: '#11d1e4', fontSize: '12px', marginLeft: '15px' }}>
                        市值: {Number(stockDetails[currentStock.stockCode].outstandingMarketValue / 100000000).toFixed(2)}亿
                      </span>
                    )}
                    {latestStockDataMap[currentStock.stockCode] && (
                      <>
                        <span style={{ fontSize: '12px', marginLeft: '15px' }}>
                          股价: <span style={{
                            color: latestStockDataMap[currentStock.stockCode].zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestStockDataMap[currentStock.stockCode].closePrice}</span>
                        </span>
                        <span style={{ fontSize: '12px', marginLeft: '15px' }}>
                          涨跌幅: <span style={{
                            color: latestStockDataMap[currentStock.stockCode].zhangDieFu >= 0 ? '#ef232a' : '#14b143',
                            fontWeight: 'bold'
                          }}>{latestStockDataMap[currentStock.stockCode].zhangDieFu >= 0 ? '+' : ''}{formatNumber(latestStockDataMap[currentStock.stockCode].zhangDieFu)}%</span>
                        </span>
                      </>
                    )}
                    {stockScoresMap[currentStock.stockCode] && (
                      <span style={{ color: '#ffd700', fontSize: '12px', marginLeft: '15px' }}>
                        分数: {formatNumber(stockScoresMap[currentStock.stockCode].score || 0)}
                        {stockScoresMap[currentStock.stockCode].extraScore && (
                          <span style={{ color: '#ffd700' }}> + {formatNumber(stockScoresMap[currentStock.stockCode].extraScore)}</span>
                        )}
                        {stockScoresMap[currentStock.stockCode].score && stockScoresMap[currentStock.stockCode].extraScore && (
                          <span style={{ color: '#1e90ff' }}> (合计: {formatNumber(parseFloat(stockScoresMap[currentStock.stockCode].score || 0) + parseFloat(stockScoresMap[currentStock.stockCode].extraScore || 0))})</span>
                        )}
                      </span>
                    )}
                  </>
                )}
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
          
          {/* 右侧：重置按钮、模式切换按钮和隐藏交易量按钮（仅在9宫格时显示） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* 重置按钮 */}
            <button
              onClick={handleResetChartEndDate}
              disabled={!chartEndDate}
              style={{
                marginRight: 6,
                padding: '2px 8px',
                backgroundColor: '#23263a',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '3px',
                cursor: !chartEndDate ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                transition: 'background 0.2s',
                opacity: !chartEndDate ? 0.5 : 1,
              }}
              onMouseOver={e => {
                if (chartEndDate) {
                  e.target.style.background = '#2a2f3a';
                  e.target.style.borderColor = '#1e90ff';
                }
              }}
              onMouseOut={e => {
                if (chartEndDate) {
                  e.target.style.background = '#23263a';
                  e.target.style.borderColor = '#444';
                }
              }}
              title="重置到最新日期"
            >
              重置
            </button>
            
            {mode === MODE_9_STOCK && (
            <button
              onClick={() => setShowVolume(!showVolume)}
              style={{
                padding: '4px 8px',
                background: showVolume ? '#23263a' : '#1e90ff',
                border: showVolume ? '1px solid #444' : '2px solid #1e90ff',
                borderRadius: '4px',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.2s',
                color: '#fff',
                fontSize: '12px',
                marginRight: '10px',
              }}
              onMouseOver={e => {
                if (showVolume) {
                  e.currentTarget.style.background = '#2a2f3a';
                  e.currentTarget.style.borderColor = '#1e90ff';
                }
              }}
              onMouseOut={e => {
                if (showVolume) {
                  e.currentTarget.style.background = '#23263a';
                  e.currentTarget.style.borderColor = '#444';
                }
              }}
              title={showVolume ? '隐藏交易量' : '显示交易量'}
            >
              {showVolume ? '隐藏交易量' : '显示交易量'}
            </button>
          )}
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
            title="1支股票，四块区域：左上-半年K线图（不显示交易量）、右上-2年、左下-5年、右下-10年K线图"
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
        
        {/* 第二行：MODE_1_STOCK 模式下显示 tags */}
        {mode === MODE_1_STOCK && currentStock?.stockCode && stockDetails[currentStock.stockCode]?.tags && Array.isArray(stockDetails[currentStock.stockCode].tags) && stockDetails[currentStock.stockCode].tags.length > 0 && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '4px', 
            marginTop: '8px',
            flexWrap: 'wrap',
          }}>
            {stockDetails[currentStock.stockCode].tags.map((tag, idx) => {
              // 获取标签颜色
              let tagColor = null;
              for (const cfg of HIGHLIGHT_TAG_CONFIG) {
                if (tag.includes(cfg.tagName)) {
                  tagColor = cfg.color;
                  break;
                }
              }
              return (
                <Tag
                  key={`${tag}-${idx}`}
                  color={tagColor || undefined}
                  style={{
                    background: tagColor ? tagColor + '22' : BG_COLOR,
                    color: tagColor || TEXT_COLOR,
                    border: tagColor ? `1px solid ${tagColor}` : '1px solid #444',
                    fontWeight: tagColor ? 'bold' : 'normal',
                    marginRight: '4px',
                    fontSize: '12px',
                    borderRadius: '16px',
                    padding: '0px 4px',
                    flexShrink: 0,
                  }}
                >
                  {tag}
                </Tag>
              );
            })}
          </div>
        )}
        
        {/* 第二行：MODE_9_STOCK 模式下显示选中股票的 tags */}
        {mode === MODE_9_STOCK && selectedGrid && (() => {
          // 从selectedGrid中提取股票代码（格式：stockCode-index）
          // 由于index是数字，从末尾查找最后一个'-'，前面的部分就是股票代码
          const lastDashIndex = selectedGrid.lastIndexOf('-');
          if (lastDashIndex > 0) {
            const selectedStockCode = selectedGrid.substring(0, lastDashIndex);
            const selectedStockDetail = stockDetails[selectedStockCode];
            if (selectedStockDetail?.tags && Array.isArray(selectedStockDetail.tags) && selectedStockDetail.tags.length > 0) {
              return (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  marginTop: '8px',
                  flexWrap: 'wrap',
                }}>
                  {selectedStockDetail.tags.map((tag, idx) => {
                    // 获取标签颜色
                    let tagColor = null;
                    for (const cfg of HIGHLIGHT_TAG_CONFIG) {
                      if (tag.includes(cfg.tagName)) {
                        tagColor = cfg.color;
                        break;
                      }
                    }
                    return (
                      <Tag
                        key={`${tag}-${idx}`}
                        color={tagColor || undefined}
                        style={{
                          background: tagColor ? tagColor + '22' : BG_COLOR,
                          color: tagColor || TEXT_COLOR,
                          border: tagColor ? `1px solid ${tagColor}` : '1px solid #444',
                          fontWeight: tagColor ? 'bold' : 'normal',
                          marginRight: '4px',
                          fontSize: '12px',
                          borderRadius: '16px',
                          padding: '0px 4px',
                          flexShrink: 0,
                        }}
                      >
                        {tag}
                      </Tag>
                    );
                  })}
                </div>
              );
            }
          }
          return null;
        })()}
      </div>

      {/* 网格容器 */}
      <div 
        className="stock-grid-container"
        style={{
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
    </div>
  );
};

export default StockDetailGrid;