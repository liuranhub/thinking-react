import * as echarts from 'echarts';

// 颜色常量
const BG_COLOR = '#181c26';
const AXIS_COLOR = '#888993';
const TEXT_COLOR = '#fff';
const RED = '#ef232a';
const GREEN = '#14b143';

// 成交量转换函数
const chenJiaoLiangConvert = (value) => {
  if (value == NaN) {
    return 0;
  }
  if (value >= 100000000) {
    return (value / 100000000).toFixed(0) + '亿';
  } else if (value >= 10000000) {
    return (value / 10000000).toFixed(0) + '千万';
  } else if (value >= 10000) {
    return (value / 10000).toFixed(0) + '万';
  } else {
    return value.toFixed(0);
  }
};

/**
 * 渲染K线图和成交量图
 * @param {Object} params - 参数对象
 * @param {HTMLElement} params.klineDom - K线图DOM元素
 * @param {HTMLElement} params.volumeDom - 成交量图DOM元素
 * @param {Array} params.allStockData - 全部股票数据
 * @param {Array} params.chartData - 当前显示的图表数据（已过滤）
 * @param {string} params.chartKey - 图表实例的唯一key
 * @param {number} params.gridIndex - 网格索引
 * @param {Object} params.chartsRef - 图表实例引用对象
 * @param {Object} params.stockDetail - 股票详情数据（可选，包含标记点数据）
 * @param {Function} params.onDateChange - 日期变化回调
 * @param {boolean} params.hideXAxisLabel - 是否隐藏X轴标签（默认false）
 * @param {number} params.highVolumeTargetPrice - 目标价格（可选，优先使用此值，否则从stockDetail中获取）
 * @returns {Object} 返回清理函数和图表实例对象
 */
export const renderKlineChart = ({
  klineDom,
  volumeDom,
  allStockData,
  chartData,
  chartKey,
  gridIndex,
  chartsRef,
  stockDetail = null,
  onDateChange = null,
  hideXAxisLabel = false,
  highVolumeTargetPrice = null
}) => {
  if (!klineDom || !allStockData || !chartData || chartData.length === 0) {
    return null;
  }
  
  // 如果 volumeDom 为 null，表示隐藏交易量，只渲染 K 线图
  const shouldRenderVolume = volumeDom !== null;

  // 清理旧的图表实例
  if (chartsRef.current[chartKey]) {
    if (chartsRef.current[chartKey].klineChart) {
      chartsRef.current[chartKey].klineChart.dispose();
    }
    if (chartsRef.current[chartKey].volumeChart) {
      chartsRef.current[chartKey].volumeChart.dispose();
    }
  }

  const allDates = allStockData.map(item => item.date);
  const chartDates = chartData.map(item => item.date);
  const chartStartIdx = allDates.indexOf(chartDates[0]);
  const chartEndIdx = allDates.indexOf(chartDates[chartDates.length - 1]);

  // K线数据
  const klineData = allStockData.slice(chartStartIdx, chartEndIdx + 1).map(item => [
    item.openPrice ?? 0,
    item.closePrice ?? 0,
    item.minPrice ?? 0,
    item.maxPrice ?? 0
  ]);

  // 成交量数据
  const volumeData = allStockData.slice(chartStartIdx, chartEndIdx + 1).map(item => item.chenJiaoLiang ?? 0);

  const dates = chartDates;
  const dataZoom = [{
    id: `stock-zoom-${gridIndex}`,
    type: 'inside',
    start: 0,
    end: 100,
    minValueSpan: 10,
    zoomOnMouseWheel: false,
    moveOnMouseWheel: false,
    moveOnMouseMove: true,
    throttle: 100,
    zoomLock: false,
    filterMode: 'filter',
    preventDefaultMouseMove: true
  }];

  // K线图配置
  const klineChart = echarts.init(klineDom);
  const klineOption = {
    backgroundColor: BG_COLOR,
    tooltip: {
      trigger: 'axis',
      show: true,
      renderMode: 'html',
      appendToBody: true,
      position: function (point, params, dom, rect, size) {
        return [40, -1];
      },
      axisPointer: {
        type: 'cross',
        handle: { show: false },
        lineStyle: {
          color: '#444',
          width: 1.2,
          type: 'dashed',
        },
        crossStyle: {
          color: '#444',
          width: 1.2,
          type: 'dashed'
        },
        label: {
          show: false,
          backgroundColor: '#23263a',
          color: '#fff',
          borderColor: '#444',
          borderWidth: 1,
        },
        animation: false,
        animationDuration: 0,
        animationEasing: 'linear',
        precision: 2,
        throttle: 100,
        snap: false,
        z: 10
      },
      backgroundColor: 'rgba(24,28,38,0.3)',
      borderColor: 'rgba(35,38,58,0.95)',
      textStyle: { color: TEXT_COLOR },
      extraCssText: 'z-index: 1000 !important;',
      formatter: function (params) {
        const currentIndex = params[0].dataIndex;
        const currentData = chartData[currentIndex];
        
        if (!currentData) {
          return '<div style="color: #fff; font-size: 12px;">数据加载中...</div>';
        }
        
        const zhangDieFu = currentData?.zhangDieFu ?? 0;
        const zhangDieFuColor = zhangDieFu >= 0 ? '#ef232a' : '#14b143';
        const zhenFu = currentData?.zhenFu ?? 0;
        const zhenFuValue = isNaN(zhenFu) ? 0 : Number(zhenFu);
        
        // 计算量比：当日交易量和前一天交易量的比例
        let liangBi = '--';
        if (currentIndex > 0) {
          const prevData = chartData[currentIndex - 1];
          const currentVolume = currentData?.chenJiaoLiang ?? 0;
          const prevVolume = prevData?.chenJiaoLiang ?? 0;
          
          if (prevVolume > 0 && currentVolume > 0) {
            const ratio = currentVolume / prevVolume;
            liangBi = ratio.toFixed(1);
          }
        }
        
        return `
          <div style="color: #fff; font-size: 12px; line-height: 1.4;">
            <div style="margin-bottom: 2px;">日期: ${params[0].axisValue || '未知'}</div>
            <div style="margin-bottom: 2px;">开盘: ${currentData.openPrice ?? '--'}</div>
            <div style="margin-bottom: 2px;">收盘: ${currentData.closePrice ?? '--'}</div>
            <div style="margin-bottom: 2px;">最低: ${currentData.minPrice ?? '--'}</div>
            <div style="margin-bottom: 2px;">最高: ${currentData.maxPrice ?? '--'}</div>
            <div style="margin-bottom: 2px;">涨跌幅: <span style="color:${zhangDieFuColor};font-weight:bold">${Number(zhangDieFu).toFixed(2)}%</span></div>
            <div style="margin-bottom: 2px;">振幅: <span style="color:#ffa500;font-weight:bold">${zhenFuValue.toFixed(2)}%</span></div>
            <div style="margin-bottom: 2px;">换手率: <span style="color:#11d1e4;font-weight:bold">${Number(currentData.huanShouLv).toFixed(2)}%</span></div>
            <div style="margin-bottom: 2px;">成交量: ${chenJiaoLiangConvert(currentData.chenJiaoLiang ?? 0)}</div>
            <div>量比: ${liangBi}</div>
          </div>
        `;
      }
    },
    grid: { 
      left: '30px', 
      right: '10px', 
      top: '5%', 
      bottom: shouldRenderVolume ? '8%' : '5%'  // 不显示交易量时，bottom 设为 15% 以对齐X轴
    },
    xAxis: {
      type: 'category',
      data: dates,
      scale: true,
      boundaryGap: false,
      axisLine: { onZero: false, lineStyle: { color: AXIS_COLOR } },
      axisPointer: {
        label: { 
          show: true,
          backgroundColor: '#23263a',
          color: '#fff',
          borderColor: '#444',
          borderWidth: 1,
          formatter: function(params) {
            return params.value || '';
          }
        }
      },
      axisTick: { show: false },
      axisLabel: {
        color: TEXT_COLOR,
        fontSize: 11,
        interval: function(index, value) {
          if (!dates || dates.length === 0) return false;
          const firstDate = new Date(dates[0]);
          const lastDate = new Date(dates[dates.length - 1]);
          const timeSpanYears = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
          let calculatedInterval = 1;
          if (timeSpanYears > 5) {
            calculatedInterval = Math.ceil(dates.length / Math.min(10, Math.ceil(timeSpanYears)));
          } else if (timeSpanYears >= 2) {
            calculatedInterval = Math.ceil(dates.length / (timeSpanYears * 2));
          } else {
            calculatedInterval = Math.ceil(dates.length / 12);
          }
          return index % calculatedInterval === 0;
        },
        formatter: function(value, index) {
          if (!value || !dates || dates.length === 0) return value;
          const firstDate = new Date(dates[0]);
          const lastDate = new Date(dates[dates.length - 1]);
          const timeSpanYears = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
          if (timeSpanYears > 5) {
            if (value.length >= 4) {
              return value.slice(0, 4);
            }
          } else if (timeSpanYears >= 2) {
            if (value.length >= 7) {
              return value.slice(0, 7);
            }
          } else {
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
        return Number(value.min * 0.95).toFixed(1);
      },
      max: function(value) {
        return Number(value.max * 1.005).toFixed(1);
      },
      axisLine: { lineStyle: { color: AXIS_COLOR } },
      axisPointer: {
        label: { 
          show: true,
          backgroundColor: '#23263a',
          color: '#fff',
          borderColor: '#444',
          borderWidth: 1,
          formatter: function(params) {
            return params.value.toFixed(2);
          }
        }
      },
      axisLabel: { color: TEXT_COLOR, fontSize: 10 },
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
        markPoint: (() => {
          if (!stockDetail) return undefined;
          
          // 收集所有标记点数据
          const markPointData = [];
          
          // 锤子线标记点
          if (stockDetail.hummerDates && Array.isArray(stockDetail.hummerDates)) {
            stockDetail.hummerDates
              .filter(item => dates.includes(item.date)) // 只显示当前图表范围内的日期
              .forEach(item => {
                // 找到对应日期的K线数据，获取最低价
                const dateIndex = dates.indexOf(item.date);
                const klineItem = klineData[dateIndex];
                const minPrice = klineItem ? klineItem[2] : 0; // K线数据格式: [open, close, low, high]

                // 根据effective字段确定颜色
                const color = item.effective === 1 ? '#9932CC' : '#00FFFF'; // 有效为紫色，否则为青色

                // 如果type为'T'或'S'，不显示pin形状，只显示文字标签
                const isTType = item.type === 'T';
                const isSType = item.type === 'S' || item.type === 'SS';
                const symbol = (isTType || isSType) ? 'circle' : 'pin';
                const symbolSize = (isTType || isSType) ? 1 : 12;
                const symbolRotate = (isTType || isSType) ? 0 : 180;
                
                // 根据type设置标签颜色：S类型为蓝色，其他为红色
                const labelColor = isSType ? '#1e90ff' : 'pink';

                markPointData.push({
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
                    fontSize: (isTType || isSType) ? 10 : 8, // T和S类型稍微大一点，确保可见
                    fontWeight: 'bold',
                    color: labelColor,
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
                });
              });
          }
          
          // 多空策略日期标记点（黄色，不显示文字标签）
          if (stockDetail.longShortStrategyDates && Array.isArray(stockDetail.longShortStrategyDates)) {
            stockDetail.longShortStrategyDates
              .filter(date => dates.includes(date)) // 只显示当前图表范围内的日期
              .forEach(date => {
                // 找到对应日期的K线数据，获取最低价
                const dateIndex = dates.indexOf(date);
                const klineItem = klineData[dateIndex];
                const minPrice = klineItem ? klineItem[2] : 0; // K线数据格式: [open, close, low, high]

                markPointData.push({
                  name: '多空策略',
                  xAxis: date,
                  yAxis: minPrice - (minPrice * 0.005), // 显示在最低价下方一点点
                  value: date,
                  symbol: 'pin',
                  symbolSize: 12,
                  symbolRotate: 180,
                  itemStyle: {
                    color: '#ffd700', // 黄色
                    borderWidth: 0
                  },
                  label: {
                    show: false // 不显示文字标签
                  },
                  tooltip: {
                    formatter: function(params) {
                      return `多空策略信号<br/>日期: ${params.data.value}`;
                    }
                  }
                });
              });
          }
          
          // 非涨停倍量柱标记点（紫色，不显示文字标签）
          if (stockDetail.highVolumeWithoutPriceLimitDates && Array.isArray(stockDetail.highVolumeWithoutPriceLimitDates)) {
            stockDetail.highVolumeWithoutPriceLimitDates
              .filter(date => dates.includes(date)) // 只显示当前图表范围内的日期
              .forEach(date => {
                // 找到对应日期的K线数据，获取最低价
                const dateIndex = dates.indexOf(date);
                const klineItem = klineData[dateIndex];
                const minPrice = klineItem ? klineItem[2] : 0; // K线数据格式: [open, close, low, high]

                markPointData.push({
                  name: '非涨停倍量柱',
                  xAxis: date,
                  yAxis: minPrice - (minPrice * 0.005), // 显示在最低价下方一点点
                  value: date,
                  symbol: 'pin',
                  symbolSize: 12,
                  symbolRotate: 180,
                  itemStyle: {
                    color: '#9932CC', // 紫色
                    borderWidth: 0
                  },
                  label: {
                    show: false // 不显示文字标签
                  },
                  tooltip: {
                    formatter: function(params) {
                      return `非涨停倍量柱信号<br/>日期: ${params.data.value}`;
                    }
                  }
                });
              });
          }
          
          // 只有当有标记点数据时才返回 markPoint 配置
          if (markPointData.length === 0) return undefined;
          
          return {
            tooltip: {
              formatter: function(params) {
                return `锤子线信号<br/>日期: ${params.data.value}`;
              }
            },
            data: markPointData
          };
        })()
      },
      // 目标价格虚线（优先使用传入的highVolumeTargetPrice，否则使用stockDetail.highVolumeTargetPrice）
      ...(() => {
        const targetPrice = stockDetail?.highVolumeTargetPrice;
        if (targetPrice && targetPrice > 0) {
          return [{
            name: '目标价格',
            type: 'line',
            data: new Array(dates.length).fill(targetPrice),
            showSymbol: false,
            symbol: 'none',  // 明确设置不显示符号
            lineStyle: { 
              width: 0.8, 
              color: 'red', 
              type: 'dashed' 
            },
            emphasis: {
              scale: false, 
              lineStyle: { width: 0.8 },
              showSymbol: false,  // emphasis 状态也不显示符号
              symbol: 'none'  // 明确设置不显示符号
            },
            tooltip: {
              formatter: function() {
                return `目标价格: ${targetPrice}`;
              }
            }
          }];
        }
        return [];
      })()
    ]
  };
  
  // 为图表组设置唯一的 groupId，用于连接K线图和交易量图
  const chartGroupId = `chart-group-${chartKey}`;
  klineChart.group = chartGroupId;
  
  klineChart.setOption(klineOption);

  // 成交量图配置（仅在需要时创建）
  const volumeChart = shouldRenderVolume ? echarts.init(volumeDom) : null;
  const volumeOption = {
    backgroundColor: BG_COLOR,
    tooltip: {
      showContent: false,
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
          show: false
        }
      },
      backgroundColor: 'rgba(24,28,38,0.95)',
      borderColor: '#333',
      textStyle: { color: TEXT_COLOR }
    },
    grid: { left: '30px', right: '10px', top: '5%', bottom: '5%' },
    xAxis: {
      type: 'category',
      data: dates,
      scale: true,
      boundaryGap: false,
      axisLine: { onZero: false, lineStyle: { color: AXIS_COLOR } },
      axisPointer: {
        label: { 
          show: true,  // 显示X轴底部的日期标签
          backgroundColor: '#23263a',
          color: '#fff',
          borderColor: '#444',
          borderWidth: 1,
          formatter: function(params) {
            return params.value || '';
          }
        }
      },
      axisTick: { show: false },
      axisLabel: {
        show: hideXAxisLabel, // 根据hideXAxisLabel参数控制是否显示X轴标签
        color: TEXT_COLOR,
        fontSize: 11,
        interval: function(index, value) {
          if (!dates || dates.length === 0) return false;
          const firstDate = new Date(dates[0]);
          const lastDate = new Date(dates[dates.length - 1]);
          const timeSpanYears = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
          let calculatedInterval = 1;
          if (timeSpanYears > 5) {
            calculatedInterval = Math.ceil(dates.length / Math.min(10, Math.ceil(timeSpanYears)));
          } else if (timeSpanYears >= 2) {
            calculatedInterval = Math.ceil(dates.length / (timeSpanYears * 2));
          } else {
            calculatedInterval = Math.ceil(dates.length / 12);
          }
          return index % calculatedInterval === 0;
        },
        formatter: function(value, index) {
          if (!value || !dates || dates.length === 0) return value;
          const firstDate = new Date(dates[0]);
          const lastDate = new Date(dates[dates.length - 1]);
          const timeSpanYears = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
          if (timeSpanYears > 5) {
            if (value.length >= 4) {
              return value.slice(0, 4);
            }
          } else if (timeSpanYears >= 2) {
            if (value.length >= 7) {
              return value.slice(0, 7);
            }
          } else {
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
      axisPointer: {
        label: { 
          show: true,
          backgroundColor: '#23263a',
          color: '#fff',
          borderColor: '#444',
          borderWidth: 1,
          formatter: function(params) {
            return chenJiaoLiangConvert(params.value);
          }
        }
      },
      axisLabel: { 
        color: TEXT_COLOR,
        fontSize: 10,
        formatter: function(value) {
          const convertedValue = chenJiaoLiangConvert(value);
          // 如果转换后的字符串长度超过3位，使用较小的字体（缩小20%）
          if (convertedValue.length > 3) {
            return `{small|${convertedValue}}`;
          }
          return convertedValue;
        },
        rich: {
          small: {
            fontSize: 8, // 10 * 0.8 = 8
            color: TEXT_COLOR
          }
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
            if (!d || typeof d.closePrice === 'undefined' || typeof d.openPrice === 'undefined') {
              return GREEN;
            }
            return d.closePrice >= d.openPrice ? RED : GREEN;
          }
        }
      }
    ]
  };
  if (shouldRenderVolume && volumeChart) {
    volumeChart.group = chartGroupId;
    volumeChart.setOption(volumeOption);
    // 连接K线图和交易量图，使鼠标悬停在任一区域时两个图表都显示十字线
    echarts.connect(chartGroupId);
  }

  // 保存图表实例
  chartsRef.current[chartKey] = {
    klineChart,
    volumeChart: volumeChart || null,
    chartGroupId: shouldRenderVolume ? chartGroupId : null
  };

  // 双击K线切换日期功能
  let touchStartHandler = null;
  if (onDateChange) {
    // 鼠标双击事件
    const dblclickHandler = (params) => {
      // 获取点击位置
      const pointInPixel = [params.offsetX, params.offsetY];
      // 转换为图表坐标系
      const pointInGrid = klineChart.convertFromPixel({ gridIndex: 0 }, pointInPixel);
      const xIndex = Math.round(pointInGrid[0]);
      
      // 获取对应索引的日期
      if (xIndex >= 0 && xIndex < dates.length) {
        const targetDate = dates[xIndex];
        if (targetDate && onDateChange) {
          onDateChange(targetDate);
        }
      }
    };
    
    klineChart.getZr().on('dblclick', dblclickHandler);
    
    // 兼容触摸设备的双击（iPad等）
    let firstTapTime = 0;
    let firstTapX = 0;
    let firstTapY = 0;
    const DOUBLE_TAP_DELAY = 300;
    const DOUBLE_TAP_DISTANCE = 50;
    
    touchStartHandler = (e) => {
      const touch = e.touches[0];
      const currentTime = Date.now();
      const timeDiff = currentTime - firstTapTime;
      const distance = Math.sqrt(
        Math.pow(touch.clientX - firstTapX, 2) + Math.pow(touch.clientY - firstTapY, 2)
      );
      
      if (timeDiff < DOUBLE_TAP_DELAY && distance < DOUBLE_TAP_DISTANCE) {
        // 执行双击切换日期功能
        const rect = klineDom.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const pointInPixel = [x, y];
        const pointInGrid = klineChart.convertFromPixel({ gridIndex: 0 }, pointInPixel);
        const xIndex = Math.round(pointInGrid[0]);
        
        // 获取对应索引的日期
        if (xIndex >= 0 && xIndex < dates.length) {
          const targetDate = dates[xIndex];
          if (targetDate && onDateChange) {
            onDateChange(targetDate);
          }
        }
        
        // 重置双击检测变量
        firstTapTime = 0;
        firstTapX = 0;
        firstTapY = 0;
        e.preventDefault();
        return;
      } else {
        // 记录第一次点击
        firstTapTime = currentTime;
        firstTapX = touch.clientX;
        firstTapY = touch.clientY;
      }
    };
    
    klineDom.addEventListener('touchstart', touchStartHandler);
  }

  // 窗口大小变化时调整图表
  const handleResize = () => {
    klineChart.resize();
    if (volumeChart) {
      volumeChart.resize();
    }
  };
  window.addEventListener('resize', handleResize);

  // 返回清理函数和图表实例
  return {
    cleanup: () => {
      window.removeEventListener('resize', handleResize);
      // 移除触摸事件监听器
      if (touchStartHandler) {
        klineDom.removeEventListener('touchstart', touchStartHandler);
      }
      if (chartsRef.current[chartKey]) {
        // 断开图表连接
        if (chartsRef.current[chartKey].chartGroupId) {
          echarts.disconnect(chartsRef.current[chartKey].chartGroupId);
        }
        if (chartsRef.current[chartKey].klineChart) {
          chartsRef.current[chartKey].klineChart.dispose();
        }
        if (chartsRef.current[chartKey].volumeChart) {
          chartsRef.current[chartKey].volumeChart.dispose();
        }
        delete chartsRef.current[chartKey];
      }
    },
    charts: {
      klineChart,
      volumeChart: volumeChart || null
    }
  };
};
