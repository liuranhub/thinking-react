import { useState, useEffect, useRef } from 'react';
import { Modal, Spin, message } from 'antd';
import * as echarts from 'echarts';
import { post } from '../utils/httpClient';
import { API_HOST } from '../config/config';
import LoadingButton from './LoadingButton';

const BG_COLOR = '#181c26';
const TEXT_COLOR = '#fff';
const AXIS_COLOR = '#888993';
const RED = '#ef232a';
const GREEN = '#14b143';
const PRICE_LINE_COLOR = '#fff';
const AVG_LINE_COLOR = '#1e90ff';  // VWAP均价线使用蓝色

/**
 * 分时图弹窗组件
 * @param {boolean} visible - 是否显示弹窗
 * @param {function} onClose - 关闭弹窗回调
 * @param {string} stockCode - 股票代码
 * @param {string} stockName - 股票名称
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @param {object} klineData - 当日K线数据 (包含 openPrice, closePrice, maxPrice, minPrice, zhangDieFu)
 */
const MinuteChartModal = ({ visible, onClose, stockCode, stockName, date, klineData }) => {
  const [loading, setLoading] = useState(false);
  const [minuteData, setMinuteData] = useState([]);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [calculateLoading, setCalculateLoading] = useState(false);
  const [calculateResult, setCalculateResult] = useState(null); // true/false/null

  // 计算股票数据
  const handleCalculate = async () => {
    if (!stockCode || !date) {
      message.error('缺少股票代码或日期参数', 2);
      return;
    }
    
    setCalculateLoading(true);
    setCalculateResult(null);
    try {
      const { protocol, hostname } = window.location;
      const browserHostServer = `${protocol}//${hostname}:18888`;
      const result = await post(`${browserHostServer}/stock/kline/stockScoreAnalyser/${stockCode}/${date}`);
      setCalculateResult(!!result);
    } catch (error) {
      console.error('计算失败:', error);
      setCalculateResult(false);
    } finally {
      setCalculateLoading(false);
    }
  };

  // 获取分时数据
  useEffect(() => {
    if (visible && stockCode && date) {
      setCalculateResult(null);
      fetchMinuteData();
    }
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [visible, stockCode, date]);

  // 渲染图表
  useEffect(() => {
    if (minuteData.length > 0 && chartRef.current) {
      renderChart();
    }
  }, [minuteData]);

  const fetchMinuteData = async () => {
    setLoading(true);
    try {
      const response = await post(`${API_HOST}/stock/getStockOneMinuteData`, [
        { stockCode, date }
      ]);
      
      if (response && response[stockCode]) {
        setMinuteData(response[stockCode]);
      } else {
        setMinuteData([]);
      }
    } catch (error) {
      console.error('获取分时数据失败:', error);
      setMinuteData([]);
    } finally {
      setLoading(false);
    }
  };

  // 格式化时间显示 (HH:mm)
  const formatTime = (tradeTime) => {
    if (!tradeTime) return '';
    // tradeTime 格式可能是 "2024-01-01T09:30:00" 或其他格式
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

  const renderChart = () => {
    if (!chartRef.current) return;

    // 销毁旧实例
    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    chartInstance.current = echarts.init(chartRef.current);

    // 准备数据
    const times = minuteData.map(item => formatTime(item.tradeTime));
    const prices = minuteData.map(item => item.closePrice);
    const volumes = minuteData.map(item => (item.chenJiaoLiang || 0) / 100);  // 转换为手（1手=100股）
    const changePercents = minuteData.map(item => item.zhangDieFu || 0);  // 直接使用接口返回的涨跌幅
    
    // 直接使用后端返回的 vwap 字段
    const avgPrices = minuteData.map(item => item.vwap || item.closePrice);

    // 根据涨跌幅计算昨收价（用于Y轴价格范围计算）
    // 昨收 = 收盘价 / (1 + 涨跌幅/100)
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

    // 计算涨跌幅范围（基于接口返回的涨跌幅数据）
    const allChangePercents = changePercents.filter(p => p !== null && p !== undefined);
    const maxChangePercent = Math.max(...allChangePercents, 0) * 1.0;
    const minChangePercent = Math.min(...allChangePercents, 0) * 1.0;
    // 确保涨跌幅范围对称
    const maxAbsChange = Math.max(Math.abs(maxChangePercent), Math.abs(minChangePercent));

    // 计算每半小时的时间点索引，用于显示垂直网格线
    const halfHourTimes = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00'];
    const halfHourIndices = halfHourTimes.map(t => times.indexOf(t)).filter(i => i >= 0);

    const option = {
      backgroundColor: BG_COLOR,
      animation: false,
      grid: [
        {
          left: '40px',
          right: '40px',
          top: '5px',
          height: '75%'
        },
        {
          left: '40px',
          right: '40px',
          top: '80%',
          height: '18%'
        }
      ],
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: {
          backgroundColor: '#23263a'
        }
      },
      tooltip: {
        show: true,
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: '#555',
            width: 1,
            type: 'dashed'
          },
          crossStyle: {
            color: '#555',
            width: 1,
            type: 'dashed'
          },
          label: {
            show: true,
            backgroundColor: '#23263a',
            color: '#fff',
            borderColor: '#444',
            borderWidth: 1
          }
        },
        backgroundColor: 'rgba(24,28,38,0.9)',
        borderColor: '#333',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: function(params) {
          if (!params || params.length === 0) return '';
          const dataIndex = params[0].dataIndex;
          const data = minuteData[dataIndex];
          if (!data) return '';
          
          const price = data.closePrice || 0;
          const changePercent = data.zhangDieFu || 0;
          const changeColor = changePercent >= 0 ? '#ef232a' : '#14b143';
          
          return `<div style="font-size:12px;line-height:1.6;">` +
            `<div>时间: ${formatTime(data.tradeTime)}</div>` +
            `<div>价格: <span style="color:${changeColor};font-weight:bold">${price.toFixed(2)}</span></div>` +
            `<div>涨跌: <span style="color:${changeColor};font-weight:bold">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</span></div>` +
            `<div>成交量: ${formatVolume((data.chenJiaoLiang || 0) / 100)}手</div>` +
            `</div>`;
        }
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
            fontSize: 12,
            interval: function(index) {
              // 显示关键时间点
              const time = times[index];
              return time === '09:30' || time === '10:30' || time === '11:30' || 
                     time === '13:00' || time === '14:00' || time === '15:00';
            }
          },
          splitLine: {
            show: true,
            interval: function(index) {
              // 每半小时显示一条垂直网格线
              return halfHourIndices.includes(index);
            },
            lineStyle: { color: '#23263a', type: 'dashed' }
          },
          boundaryGap: false
        },
        {
          type: 'category',
          data: times,
          gridIndex: 1,
          axisLine: { lineStyle: { color: AXIS_COLOR } },
          axisTick: { show: false },
          axisLabel: { show: false },
          splitLine: {
            show: true,
            interval: function(index) {
              // 每半小时显示一条垂直网格线
              return halfHourIndices.includes(index);
            },
            lineStyle: { color: '#23263a', type: 'dashed' }
          },
          boundaryGap: false
        }
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
            fontSize: 12,
            formatter: (value) => value.toFixed(2)
          },
          splitLine: {
            lineStyle: { color: '#23263a', type: 'dashed' }
          },
          interval: (maxPrice - minPrice) / 10  // 使用interval精确控制刻度间隔
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
            fontSize: 12,
            formatter: (value) => value.toFixed(1) + '%'
          },
          splitLine: { show: false },
          interval: maxAbsChange / 5  // 使用interval精确控制刻度间隔
        },
        {
          type: 'value',
          gridIndex: 1,
          position: 'left',
          axisLine: { lineStyle: { color: AXIS_COLOR } },
          axisLabel: {
            color: TEXT_COLOR,
            fontSize: 12,
            formatter: (value) => formatVolume(value)
          },
          splitLine: {
            lineStyle: { color: '#23263a', type: 'dashed' }
          },
          splitNumber: 2
        }
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
        {
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
        }
      ],
    };

    // 添加昨收价水平线
    option.series.push({
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
    });

    chartInstance.current.setOption(option);

    // 响应窗口大小变化
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  };

  // 计算当日涨跌幅颜色
  const getChangeColor = () => {
    if (!klineData) return TEXT_COLOR;
    return (klineData.zhangDieFu || 0) >= 0 ? RED : GREEN;
  };

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1600}
      centered
      destroyOnClose
      styles={{
        content: {
          backgroundColor: BG_COLOR,
          padding: 0,
          borderRadius: '8px'
        },
        body: {
          backgroundColor: BG_COLOR,
          padding: 0
        },
        header: {
          backgroundColor: BG_COLOR
        },
        mask: {
          backgroundColor: 'rgba(0, 0, 0, 0.6)'
        }
      }}
      className="minute-chart-modal"
    >
      <div style={{ padding: '16px', color: TEXT_COLOR, backgroundColor: BG_COLOR }}>
        {/* 头部信息 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '12px',
          borderBottom: '1px solid #333',
          paddingBottom: '12px'
        }}>
          <div>
            <span style={{ fontSize: '16px', fontWeight: 'bold', marginRight: '12px' }}>
              {stockName || stockCode}
            </span>
            <span style={{ color: '#888', fontSize: '14px' }}>
              {stockCode}
            </span>
          </div>
          <div style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>{date}</span>
            {klineData && (
              <>
                <span>
                  开: <span style={{ color: getChangeColor() }}>{klineData.openPrice?.toFixed(2)}</span>
                </span>
                <span>
                  高: <span style={{ color: RED }}>{klineData.maxPrice?.toFixed(2)}</span>
                </span>
                <span>
                  低: <span style={{ color: GREEN }}>{klineData.minPrice?.toFixed(2)}</span>
                </span>
                <span>
                  收: <span style={{ color: getChangeColor() }}>{klineData.closePrice?.toFixed(2)}</span>
                </span>
                <span>
                  涨跌: <span style={{ color: getChangeColor(), fontWeight: 'bold' }}>
                    {(klineData.zhangDieFu || 0) >= 0 ? '+' : ''}{(klineData.zhangDieFu || 0).toFixed(2)}%
                  </span>
                </span>
              </>
            )}
            <LoadingButton
              onClick={handleCalculate}
              loading={calculateLoading}
              loadingText=""
              style={{
                width: '45px',
                height: '20px',
                marginLeft: 20,
                marginRight: 50,
                ...(calculateResult !== null && {
                  borderColor: calculateResult ? GREEN : RED,
                  borderWidth: '2px',
                  borderStyle: 'solid',
                }),
              }}
              title="计算股票数据"
            >
              计算
            </LoadingButton>
            
          </div>
        </div>

        {/* 图表区域 */}
        <div style={{ position: 'relative', height: '900px' }}>
          {loading ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '100%' 
            }}>
              <Spin size="large" tip="加载分时数据..." />
            </div>
          ) : minuteData.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '100%',
              color: '#888'
            }}>
              暂无分时数据
            </div>
          ) : (
            <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default MinuteChartModal;
