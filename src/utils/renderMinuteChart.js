import * as echarts from 'echarts';

// 颜色常量
const BG_COLOR = '#181c26';
const AXIS_COLOR = '#888993';
const TEXT_COLOR = '#fff';
const RED = '#ef232a';
const GREEN = '#14b143';
const PRICE_LINE_COLOR = '#fff';
const AVG_LINE_COLOR = '#1e90ff';  // VWAP均价线使用蓝色

// 格式化时间显示 (HH:mm)
const formatTime = (tradeTime) => {
  if (!tradeTime) return '';
  if (typeof tradeTime === 'string') {
    const timePart = tradeTime.split('T')[1];
    if (timePart) {
      return timePart.substring(0, 5);
    }
  }
  return tradeTime;
};

// 格式化成交量显示（单位：手）
const formatVolume = (value) => {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(0) + '百万';
  } else if (value >= 100000) {
    return (value / 100000).toFixed(0) + '十万';
  } else if (value >= 10000) {
    return (value / 10000).toFixed(0) + '万';
  } else if (value >= 1000) {
    return (value / 1000).toFixed(0) + '千';
  }
  return value.toFixed(0);
};

/**
 * 渲染分时图
 * @param {Object} params - 参数对象
 * @param {HTMLElement} params.chartDom - 图表DOM元素
 * @param {Array} params.minuteData - 分时数据数组
 * @param {string} params.chartKey - 图表实例的唯一key
 * @param {Object} params.chartsRef - 图表实例引用对象
 * @param {boolean} params.showVolume - 是否显示成交量（默认true）
 * @returns {Object} 返回清理函数和图表实例对象
 */
export const renderMinuteChart = ({
  chartDom,
  minuteData,
  chartKey,
  chartsRef,
  showVolume = true
}) => {
  if (!chartDom || !minuteData || minuteData.length === 0) {
    return null;
  }

  // 清理旧的图表实例
  if (chartsRef.current[chartKey]) {
    if (chartsRef.current[chartKey].minuteChart) {
      chartsRef.current[chartKey].minuteChart.dispose();
    }
  }

  const minuteChart = echarts.init(chartDom);

  // 准备数据
  const times = minuteData.map(item => formatTime(item.tradeTime));
  const prices = minuteData.map(item => item.closePrice);
  const volumes = minuteData.map(item => (item.chenJiaoLiang || 0) / 100);  // 转换为手（1手=100股）
  const changePercents = minuteData.map(item => item.zhangDieFu || 0);  // 直接使用接口返回的涨跌幅
  
  // 直接使用后端返回的 vwap 字段
  const avgPrices = minuteData.map(item => item.vwap || item.closePrice);

  // 根据涨跌幅计算昨收价
  const lastData = minuteData[minuteData.length - 1];
  const prevClose = lastData?.closePrice && lastData?.zhangDieFu !== undefined ? 
    (lastData.closePrice / (1 + lastData.zhangDieFu / 100)) : 
    (prices[0] || 0);

  // 计算价格范围
  const allPrices = [...prices, ...avgPrices].filter(p => p > 0);
  let minPrice = Math.min(...allPrices);
  let maxPrice = Math.max(...allPrices);
  
  // 确保价格范围对称（相对于昨收价）
  const maxDiff = Math.max(Math.abs(maxPrice - prevClose), Math.abs(minPrice - prevClose));
  minPrice = prevClose - maxDiff * 1.0;
  maxPrice = prevClose + maxDiff * 1.0;

  // 计算涨跌幅范围
  const allChangePercents = changePercents.filter(p => p !== null && p !== undefined);
  const maxChangePercent = Math.max(...allChangePercents, 0) * 1.0;
  const minChangePercent = Math.min(...allChangePercents, 0) * 1.0;
  const maxAbsChange = Math.max(Math.abs(maxChangePercent), Math.abs(minChangePercent));

  // 计算每半小时的时间点索引
  const halfHourTimes = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00'];
  const halfHourIndices = halfHourTimes.map(t => times.indexOf(t)).filter(i => i >= 0);

  // 根据是否显示成交量调整grid配置
  const grids = showVolume ? [
    {
      left: '40px',
      right: '35px',
      top: '5px',
      height: '75%'
    },
    {
      left: '40px',
      right: '35px',
      top: '80%',
      height: '18%'
    }
  ] : [
    {
      left: '40px',
      right: '35px',
      top: '5px',
      bottom: '25px'
    }
  ];

  const option = {
    backgroundColor: BG_COLOR,
    animation: false,
    grid: grids,
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      label: {
        backgroundColor: '#23263a'
      }
    },
    tooltip: {
      show: false  // 不显示tooltip
    },
    xAxis: [
      {
        type: 'category',
        data: times,
        gridIndex: 0,
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisTick: { show: false },
        axisLabel: {
          color: TEXT_COLOR,
          fontSize: 10,
          interval: function(index) {
            const time = times[index];
            return time === '09:30' || time === '10:30' || time === '11:30' || 
                   time === '13:00' || time === '14:00' || time === '15:00';
          }
        },
        splitLine: {
          show: true,
          interval: function(index) {
            return halfHourIndices.includes(index);
          },
          lineStyle: { color: '#23263a', type: 'dashed' }
        },
        boundaryGap: false
      },
      ...(showVolume ? [{
        type: 'category',
        data: times,
        gridIndex: 1,
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: {
          show: true,
          interval: function(index) {
            return halfHourIndices.includes(index);
          },
          lineStyle: { color: '#23263a', type: 'dashed' }
        },
        boundaryGap: false
      }] : [])
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        position: 'left',
        min: minPrice,
        max: maxPrice,
        scale: false,
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisPointer: {
          label: {
            formatter: (params) => params.value.toFixed(2)
          }
        },
        axisLabel: {
          color: function(value) {
            if (value > prevClose) return RED;
            if (value < prevClose) return GREEN;
            return TEXT_COLOR;
          },
          fontSize: 10,
          formatter: (value) => value.toFixed(2)
        },
        splitLine: {
          lineStyle: { color: '#23263a', type: 'dashed' }
        },
        interval: (maxPrice - minPrice) / 10
      },
      {
        type: 'value',
        gridIndex: 0,
        position: 'right',
        min: -maxAbsChange,
        max: maxAbsChange,
        scale: false,
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisPointer: {
          label: {
            formatter: (params) => params.value.toFixed(2) + '%'
          }
        },
        axisLabel: {
          color: function(value) {
            if (value > 0) return RED;
            if (value < 0) return GREEN;
            return TEXT_COLOR;
          },
          fontSize: 10,
          formatter: (value) => value.toFixed(1) + '%'
        },
        splitLine: { show: false },
        interval: maxAbsChange / 5
      },
      ...(showVolume ? [{
        type: 'value',
        gridIndex: 1,
        position: 'left',
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisLabel: {
          color: TEXT_COLOR,
          fontSize: 10,
          formatter: (value) => formatVolume(value)
        },
        splitLine: {
          lineStyle: { color: '#23263a', type: 'dashed' }
        },
        splitNumber: 2
      }] : [])
    ],
    series: [
      {
        name: '价格',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: prices,
        symbol: 'none',
        lineStyle: {
          color: PRICE_LINE_COLOR,
          width: 1
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(136, 137, 147, 0.25)' },
            { offset: 1, color: 'rgba(136, 137, 147, 0.02)' }
          ])
        }
      },
      {
        name: '均价',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: avgPrices,
        symbol: 'none',
        lineStyle: {
          color: AVG_LINE_COLOR,
          width: 1
        }
      },
      // 昨收价水平线
      {
        name: '昨收',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: new Array(times.length).fill(prevClose),
        symbol: 'none',
        lineStyle: {
          color: '#666',
          width: 1,
          type: 'dashed'
        }
      },
      ...(showVolume ? [{
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: volumes.map((vol, idx) => {
          const currentPrice = prices[idx];
          const prevPrice = idx > 0 ? prices[idx - 1] : prevClose;
          return {
            value: vol,
            itemStyle: {
              color: currentPrice >= prevPrice ? RED : GREEN
            }
          };
        }),
        barWidth: '60%'
      }] : [])
    ]
  };

  minuteChart.setOption(option);

  // 保存图表实例
  chartsRef.current[chartKey] = {
    minuteChart,
    cleanup: () => {
      window.removeEventListener('resize', handleResize);
      if (chartsRef.current[chartKey]?.minuteChart) {
        chartsRef.current[chartKey].minuteChart.dispose();
        delete chartsRef.current[chartKey];
      }
    }
  };

  // 窗口大小变化时调整图表
  const handleResize = () => {
    minuteChart.resize();
  };
  window.addEventListener('resize', handleResize);

  return {
    cleanup: chartsRef.current[chartKey].cleanup,
    charts: {
      minuteChart
    }
  };
};
