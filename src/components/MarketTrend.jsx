import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { get } from '../utils/httpClient';
import { API_HOST } from '../config/config';

const MarketTrend = () => {
  const [data, setData] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState(['rise']); // 默认显示上涨
  const host = API_HOST;
  const DISPLAY_COUNT = 50; // 显示的数据点数量

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await get(`${host}/stock/statMarketRiseDown`);
      setData(response);
    } catch (error) {
      console.error('Error fetching market trend data:', error);
    }
  };

  const getOption = () => {
    const dates = data.map(item => item.date);
    const defaultStartValue = Math.max(0, dates.length - DISPLAY_COUNT);
    const defaultEndValue = dates.length - 1;

    const series = [
      {
        name: '上涨',
        type: 'line',
        data: data.map(item => item.rise),
        itemStyle: {
          color: '#ff4d4f'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [{
              offset: 0,
              color: 'rgba(255,77,79,0.3)'
            }, {
              offset: 1,
              color: 'rgba(255,77,79,0)'
            }]
          }
        },
        showSymbol: false,
        emphasis: {
          focus: 'series'
        }
      },
      {
        name: '下跌',
        type: 'line',
        data: data.map(item => item.down),
        itemStyle: {
          color: '#52c41a'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [{
              offset: 0,
              color: 'rgba(82,196,26,0.3)'
            }, {
              offset: 1,
              color: 'rgba(82,196,26,0)'
            }]
          }
        },
        showSymbol: false,
        emphasis: {
          focus: 'series'
        }
      }
    ].filter(s => selectedSeries.includes(s.name === '上涨' ? 'rise' : 'down'));

    return {
      title: {
        text: '市场涨跌统计',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          label: {
            backgroundColor: '#6a7985'
          }
        }
      },
      legend: {
        data: ['上涨', '下跌'],
        top: '25px',
        selected: {
          '上涨': selectedSeries.includes('rise'),
          '下跌': selectedSeries.includes('down')
        },
        selectedMode: 'single', // 只允许选择一个
        formatter: name => {
          const type = name === '上涨' ? 'rise' : 'down';
          return `{${type}|${name}}`;
        },
        textStyle: {
          rich: {
            rise: {
              color: '#ff4d4f'
            },
            down: {
              color: '#52c41a'
            }
          }
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        containLabel: true
      },
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: [0],
          startValue: defaultStartValue,
          endValue: defaultEndValue,
          moveHandleSize: 10,
          height: 20,
          bottom: 10,
          borderColor: 'transparent',
          fillerColor: 'rgba(0,0,0,0.1)',
          handleStyle: {
            color: '#f0f0f0',
            borderColor: '#ccc'
          },
          emphasis: {
            handleStyle: {
              borderColor: '#aaa'
            }
          },
          zoomLock: true, // 锁定缩放比例
          brushSelect: false // 禁用刷选功能
        },
        {
          type: 'inside',
          xAxisIndex: [0],
          startValue: defaultStartValue,
          endValue: defaultEndValue,
          zoomLock: true,
          zoomOnMouseWheel: false,  // 禁用鼠标滚轮缩放
          moveOnMouseMove: true,    // 启用鼠标移动平移
          moveOnMouseWheel: true,   // 启用鼠标滚轮平移
          preventDefaultMouseMove: true  // 阻止默认鼠标移动事件
        }
      ],
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: {
          lineStyle: {
            color: '#ccc'
          }
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: {
            color: '#ccc'
          }
        },
        splitLine: {
          lineStyle: {
            color: '#f0f0f0'
          }
        }
      },
      series
    };
  };

  const onChartLegendselectchanged = (params) => {
    const { selected } = params;
    const newSelectedSeries = [];
    if (selected['上涨']) newSelectedSeries.push('rise');
    if (selected['下跌']) newSelectedSeries.push('down');
    setSelectedSeries(newSelectedSeries);
  };

  return (
    <div style={{ 
      padding: '20px',
      backgroundColor: '#fff',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <ReactECharts
        option={getOption()}
        style={{ height: '400px' }}
        opts={{ renderer: 'svg' }}
        onEvents={{
          legendselectchanged: onChartLegendselectchanged
        }}
      />
    </div>
  );
};

export default MarketTrend; 