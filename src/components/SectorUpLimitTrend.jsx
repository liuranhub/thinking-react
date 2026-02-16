import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { get } from '../utils/httpClient';
import { API_HOST } from '../config/config';
import { useNavigate } from 'react-router-dom';
import { DatePicker, Input, Tag } from 'antd';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(weekOfYear);

// 将十六进制颜色转换为 rgba
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const SectorUpLimitTrend = () => {
  const [data, setData] = useState([]);
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedDate, setSelectedDate] = useState(dayjs()); // 默认当前日期
  const [bottomChartData, setBottomChartData] = useState([]); // 下方图表数据（90天）
  const [bottomChartSectorName, setBottomChartSectorName] = useState(''); // 下方图表板块名称
  const [bottomChartLoading, setBottomChartLoading] = useState(false); // 下方图表加载状态
  const [yearChartData, setYearChartData] = useState([]); // 一年图表数据（365天）
  const [yearChartSectorName, setYearChartSectorName] = useState(''); // 一年图表板块名称
  const [yearChartLoading, setYearChartLoading] = useState(false); // 一年图表加载状态
  const [year3ChartData, setYear3ChartData] = useState([]); // 3年图表数据（1095天）
  const [year3ChartSectorName, setYear3ChartSectorName] = useState(''); // 3年图表板块名称
  const [year3ChartLoading, setYear3ChartLoading] = useState(false); // 3年图表加载状态
  const [allSectors, setAllSectors] = useState([]); // 所有板块列表
  const [selectedSectorCode, setSelectedSectorCode] = useState(null); // 手动选中的板块code
  const [isManualSelection, setIsManualSelection] = useState(false); // 是否手动选择了板块
  const [searchKeyword, setSearchKeyword] = useState(''); // 搜索关键词
  const [highlightedIndex, setHighlightedIndex] = useState(-1); // 键盘高亮的索引
  const [stockList, setStockList] = useState([]); // 板块股票列表
  const [stockListLoading, setStockListLoading] = useState(false); // 股票列表加载状态
  const sectorListRef = useRef(null); // 板块列表容器的引用
  const highlightedSeriesRef = useRef(null); // 记录当前高亮的系列名称
  const dataRef = useRef([]); // 存储最新的 data，避免闭包问题
  const fetchNDaysDataRef = useRef(null); // 存储最新的 fetchNDaysData，避免闭包问题
  const host = API_HOST;
  const navigate = useNavigate();

  // 滚动到高亮的板块
  const scrollToHighlighted = useCallback((index) => {
    if (sectorListRef.current) {
      const items = sectorListRef.current.querySelectorAll('[data-index]');
      if (items[index]) {
        items[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, []);

  // 获取所有板块列表
  useEffect(() => {
    const fetchAllSectors = async () => {
      try {
        const response = await get(`${host}/stock/getAllBk`);
        if (response && Array.isArray(response)) {
          setAllSectors(response);
        }
      } catch (error) {
        console.error('Error fetching all sectors:', error);
      }
    };
    fetchAllSectors();
  }, [host]);

  // 搜索关键词变化时重置高亮索引
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchKeyword]);

  useEffect(() => {
    fetchData();
  }, [selectedDate, selectedSectorCode]);

  const fetchData = async () => {
    try {
      // 格式化日期为 YYYY-MM-DD
      const dateStr = selectedDate.format('YYYY-MM-DD');
      // 如果手动选择了板块，传递 sectorCode 参数
      const url = selectedSectorCode 
        ? `${host}/stock/getSectorUpLimitData?date=${dateStr}&sectorCode=${selectedSectorCode}`
        : `${host}/stock/getSectorUpLimitData?date=${dateStr}`;
      
      const response = await get(url);
      if (!response || !Array.isArray(response)) {
        // 401 或其他错误，已触发跳转到认证页面，这里不需要做任何处理
        return;
      }
      setData(response);
      dataRef.current = response; // 更新 ref
      
      // 如果没有手动选择板块，使用默认逻辑
      if (!isManualSelection || !selectedSectorCode) {
        // 默认选择前5个板块（每次数据加载时都重新设置，确保有数据时能显示）
        if (response.length > 0) {
          const defaultSelected = response.slice(0, Math.min(5, response.length)).map(item => item.sectorStockCode);
          setSelectedSectors(defaultSelected);
          
          // 只有在没有手动选择板块时才自动加载排序第一的板块数据
          if (!isManualSelection && !selectedSectorCode) {
            const firstSector = response[0]; // 后端已按sort降序排序，第一个就是sort最大的
            if (firstSector && firstSector.sectorStockCode) {
              const sectorName = firstSector.sectorStockName || firstSector.sectorStockCode;
              // 设置 selectedSectorCode，触发股票列表的自动获取
              setSelectedSectorCode(firstSector.sectorStockCode);
              setIsManualSelection(false); // 保持为自动选择状态
              // 加载该板块的图表数据
              fetchNDaysDataRef.current?.(firstSector.sectorStockCode, sectorName);
            }
          }
        } else {
          setSelectedSectors([]);
        }
      } else {
        // 手动选择了板块，只更新选中板块的列表显示
        // 如果手动选择了板块，需要重新加载该板块的90天、365天和1095天数据（因为日期可能变化了）
        if (response.length > 0) {
          const selected = response.map(item => item.sectorStockCode);
          setSelectedSectors(selected);
          // 重新加载选中板块的详细数据（日期变化时）
          const selectedSector = allSectors.find(s => s.stockCode === selectedSectorCode);
          if (selectedSector && fetchNDaysDataRef.current) {
            fetchNDaysDataRef.current(selectedSectorCode, selectedSector.stockName);
          }
        } else {
          setSelectedSectors([]);
        }
      }
    } catch (error) {
      console.error('Error fetching sector up limit data:', error);
    }
  };

  // 获取90天、365天和1095天数据（用于下方图表）
  const fetchNDaysData = useCallback(async (sectorCode, sectorName) => {
    setBottomChartLoading(true);
    setYearChartLoading(true);
    setYear3ChartLoading(true);
    try {
      const dateStr = selectedDate.format('YYYY-MM-DD');
      
      // 并行获取90天、365天和1095天数据
      const [response90, response365, response1095] = await Promise.all([
        get(`${host}/stock/getSectorUpLimitDataNDays?date=${dateStr}&sectorCode=${sectorCode}&days=90`),
        get(`${host}/stock/getSectorUpLimitDataNDays?date=${dateStr}&sectorCode=${sectorCode}&days=365`),
        get(`${host}/stock/getSectorUpLimitDataNDays?date=${dateStr}&sectorCode=${sectorCode}&days=1095`)
      ]);
      
      // 处理90天数据
      if (response90 && Array.isArray(response90)) {
        const sortedData90 = [...response90].sort((a, b) => {
          return a.date.localeCompare(b.date);
        });
        setBottomChartData(sortedData90);
        setBottomChartSectorName(sectorName);
      } else {
        setBottomChartData([]);
      }
      
      // 处理365天数据
      if (response365 && Array.isArray(response365)) {
        const sortedData365 = [...response365].sort((a, b) => {
          return a.date.localeCompare(b.date);
        });
        setYearChartData(sortedData365);
        setYearChartSectorName(sectorName);
      } else {
        setYearChartData([]);
      }
      
      // 处理1095天数据
      if (response1095 && Array.isArray(response1095)) {
        const sortedData1095 = [...response1095].sort((a, b) => {
          return a.date.localeCompare(b.date);
        });
        setYear3ChartData(sortedData1095);
        setYear3ChartSectorName(sectorName);
      } else {
        setYear3ChartData([]);
      }
    } catch (error) {
      console.error('Error fetching N days data:', error);
    } finally {
      setBottomChartLoading(false);
      setYearChartLoading(false);
      setYear3ChartLoading(false);
    }
  }, [selectedDate, host]);
  
  // 更新 ref
  useEffect(() => {
    fetchNDaysDataRef.current = fetchNDaysData;
  }, [fetchNDaysData]);

  // 获取板块股票列表
  const fetchStockList = useCallback(async (sectorStockCode) => {
    if (!sectorStockCode) {
      setStockList([]);
      return;
    }
    
    setStockListLoading(true);
    try {
      const response = await get(`${host}/stock/getSectorStockAnalysisList?sectorStockCode=${sectorStockCode}`);
      if (response && Array.isArray(response)) {
        setStockList(response);
      } else {
        setStockList([]);
      }
    } catch (error) {
      console.error('Error fetching stock list:', error);
      setStockList([]);
    } finally {
      setStockListLoading(false);
    }
  }, [host]);

  // 当选择板块时，获取股票列表
  useEffect(() => {
    if (selectedSectorCode) {
      fetchStockList(selectedSectorCode);
    } else {
      setStockList([]);
    }
  }, [selectedSectorCode, fetchStockList]);

  // 图表实例引用
  const chartInstanceRef = useRef(null);

  // 图表准备就绪时的回调（只在图表初始化时调用一次）
  const onChartReady = useCallback((chart) => {
    chartInstanceRef.current = chart;
    
    if (!chart || !chart.getZr) {
      return;
    }
    
    const zr = chart.getZr();
    
    // 监听全局鼠标移动事件，检测当前高亮的系列
    zr.off('mousemove');
    zr.on('mousemove', (event) => {
      const pointInPixel = [event.offsetX, event.offsetY];
      
      // 查找鼠标位置对应的系列
      const findParams = chart.convertFromPixel('grid', pointInPixel);
      
      // 获取图表配置
      const option = chart.getOption();
      if (!option || !option.series) {
        return;
      }
      
      // 遍历所有系列，找到最接近鼠标位置的系列
      let closestSeries = null;
      let minDistance = Infinity;
      
      option.series.forEach((series, seriesIndex) => {
        if (series.data && Array.isArray(series.data)) {
          // 计算鼠标位置到系列的距离
          // 简化处理：检查鼠标是否在系列数据范围内
          const xIndex = Math.round(findParams[0]);
          if (xIndex >= 0 && xIndex < series.data.length) {
            const yValue = series.data[xIndex];
            if (yValue !== null && yValue !== undefined) {
              // 将 y 值转换为像素坐标
              const pointInValue = [findParams[0], yValue];
              const pointInPixel2 = chart.convertToPixel('grid', pointInValue);
              const distance = Math.abs(event.offsetY - pointInPixel2[1]);
              
              if (distance < minDistance && distance < 50) { // 50像素范围内
                minDistance = distance;
                closestSeries = series;
              }
            }
          }
        }
      });
      
      if (closestSeries && closestSeries.name) {
        highlightedSeriesRef.current = closestSeries.name;
      }
    });
    
    // 监听全局点击事件
    zr.off('click');
    zr.on('click', (event) => {
      const pointInPixel = [event.offsetX, event.offsetY];
      
      // 检查点击位置是否在图表坐标系内
      try {
        const findParams = chart.convertFromPixel('grid', pointInPixel);
        
        // 如果点击位置不在坐标系内，则不处理
        if (!findParams || findParams.length < 2) {
          return;
        }
        
        // 获取图表配置
        const option = chart.getOption();
        if (!option || !option.series) {
          return;
        }
        
        // 检查点击位置是否在折线图线条附近（50像素范围内）
        let clickedSeries = null;
        let minDistance = Infinity;
        const threshold = 50; // 50像素阈值
        
        option.series.forEach((series) => {
          if (series.data && Array.isArray(series.data) && series.type === 'line') {
            const xIndex = Math.round(findParams[0]);
            if (xIndex >= 0 && xIndex < series.data.length) {
              const yValue = series.data[xIndex];
              if (yValue !== null && yValue !== undefined) {
                // 将数据值转换为像素坐标
                const pointInValue = [findParams[0], yValue];
                const pointInPixel2 = chart.convertToPixel('grid', pointInValue);
                const distance = Math.sqrt(
                  Math.pow(event.offsetX - pointInPixel2[0], 2) + 
                  Math.pow(event.offsetY - pointInPixel2[1], 2)
                );
                
                if (distance < minDistance && distance < threshold) {
                  minDistance = distance;
                  clickedSeries = series;
                }
              }
            }
          }
        });
        
        // 如果没有点击到折线图线条附近，则不处理
        if (!clickedSeries || !clickedSeries.name) {
          return;
        }
        
        console.log('Chart clicked on series:', clickedSeries.name);
        
        // 使用 ref 获取最新的 data 和 fetchNDaysData，避免闭包问题
        const currentData = dataRef.current;
        const currentFetchNDaysData = fetchNDaysDataRef.current;
        
        if (!currentData || !currentFetchNDaysData) {
          return;
        }
        
        // 找到对应的板块代码
        const sector = currentData.find(item => {
          const name = item.sectorStockName || item.sectorStockCode;
          return name === clickedSeries.name;
        });
        
        if (sector) {
          console.log('Fetching data for sector:', sector.sectorStockCode);
          currentFetchNDaysData(sector.sectorStockCode, sector.sectorStockName || sector.sectorStockCode);
        }
      } catch (error) {
        // 如果转换失败，说明点击不在图表区域内，不处理
        console.debug('Click outside chart area:', error);
        return;
      }
    });
  }, []); // 移除依赖，使用 ref 避免闭包问题

  // 处理图表系列点击事件（作为备用，只在点击到折线图系列时处理）
  const handleChartClick = useCallback((params) => {
    console.log('Series click event:', params);
    
    // 只处理折线图系列的点击事件
    if (params && params.seriesName && params.seriesType === 'line') {
      const sector = data.find(item => {
        const name = item.sectorStockName || item.sectorStockCode;
        return name === params.seriesName;
      });
      
      if (sector) {
        fetchNDaysData(sector.sectorStockCode, sector.sectorStockName || sector.sectorStockCode);
      }
    }
  }, [data, fetchNDaysData]);

  // 生成下方图表的配置（使用 useMemo 缓存，避免不必要的重新渲染）
  const bottomChartOption = useMemo(() => {
    if (!bottomChartData || !Array.isArray(bottomChartData) || bottomChartData.length === 0) {
      return {
        title: {
          text: bottomChartSectorName ? `${bottomChartSectorName} - 最近90天涨停趋势` : '请在上方图表中选择一个板块',
          left: 'center',
        },
        xAxis: {
          type: 'category',
          data: []
        },
        yAxis: {
          type: 'value'
        },
        series: []
      };
    }

    // 确保数据按日期排序（从旧到新）
    const sortedData = [...bottomChartData].sort((a, b) => {
      return a.date.localeCompare(b.date);
    });
    
    const dates = sortedData.map(item => item.date);
    const counts = sortedData.map(item => item.count || 0);

    // 找到当前系列在主图表中的颜色（使用与上方图表相同的颜色分配逻辑）
    // 上方图表使用 selectedSectors 过滤后的索引来确定颜色
    const filteredSectors = data.filter(sector => selectedSectors.includes(sector.sectorStockCode));
    const sectorIndex = filteredSectors.findIndex(item => {
      const name = item.sectorStockName || item.sectorStockCode;
      return name === bottomChartSectorName;
    });
    const colors = [
      '#ff4d4f', '#52c41a', '#1890ff', '#faad14', '#722ed1',
      '#eb2f96', '#13c2c2', '#fa8c16', '#2f54eb', '#a0d911'
    ];
    const color = sectorIndex >= 0 ? colors[sectorIndex % colors.length] : '#1890ff';

    return {
      title: {
        text: `${bottomChartSectorName} - 最近90天涨停趋势`,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          const param = params[0];
          return `${param.name}<br/>涨停数量: <strong style="color: ${param.color};">${param.value}</strong>`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '0%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: {
          lineStyle: {
            color: '#ccc'
          }
        },
        axisLabel: {
          rotate: 45,
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        name: '涨停数量',
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
      series: [
        {
          name: '涨停数量',
          type: 'line',
          data: counts,
          itemStyle: {
            color: color
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
                color: hexToRgba(color, 0.3)
              }, {
                offset: 1,
                color: hexToRgba(color, 0)
              }]
            }
          },
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 6,
          smooth: false,
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return params.value !== null && params.value !== undefined ? params.value : '';
            },
            fontSize: 10,
            color: '#333'
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            lineStyle: {
              color: '#ff4d4f',
              type: 'dashed',
              width: 1,
              opacity: 0.6
            },
            data: [
              {
                yAxis: 15,
                label: {
                  show: true,
                  position: 'end',
                  formatter: '15',
                  fontSize: 12,
                  color: '#ff4d4f',
                  backgroundColor: 'transparent'
                }
              }
            ]
          }
        }
      ]
    };
  }, [bottomChartData, bottomChartSectorName, data, selectedSectors]);

  // 生成一年图表的配置（使用 useMemo 缓存，避免不必要的重新渲染，按周聚合）
  const yearChartOption = useMemo(() => {
    if (!yearChartData || !Array.isArray(yearChartData) || yearChartData.length === 0) {
      return {
        title: {
          text: yearChartSectorName ? `${yearChartSectorName} - 最近一年涨停趋势` : '请在上方图表中选择一个板块',
          left: 'center',
        },
        xAxis: {
          type: 'category',
          data: []
        },
        yAxis: {
          type: 'value'
        },
        series: []
      };
    }

    // 确保数据按日期排序（从旧到新）
    const sortedData = [...yearChartData].sort((a, b) => {
      return a.date.localeCompare(b.date);
    });
    
    // 按周聚合数据
    const weekDataMap = new Map();
    sortedData.forEach(item => {
      if (item.date) {
        // 使用 dayjs 获取日期所在的周
        const dateObj = dayjs(item.date);
        const year = dateObj.year();
        const week = dateObj.week(); // ISO周数
        const weekKey = `${year}-W${week.toString().padStart(2, '0')}`; // 例如 "2024-W01"
        
        if (!weekDataMap.has(weekKey)) {
          weekDataMap.set(weekKey, {
            weekKey: weekKey,
            year: year,
            week: week,
            count: 0,
            dates: []
          });
        }
        
        const weekData = weekDataMap.get(weekKey);
        weekData.count += (item.count || 0);
        weekData.dates.push(item.date);
      }
    });
    
    // 转换为数组并按周排序
    const weekDataArray = Array.from(weekDataMap.values()).sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      return a.week - b.week;
    });
    
    // 格式化X轴显示为年月（例如：2024-01）
    // 从dates数组中取第一个日期来确定月份
    const months = weekDataArray.map(item => {
      if (item.dates && item.dates.length > 0) {
        const firstDate = dayjs(item.dates[0]);
        return `${firstDate.year()}-${String(firstDate.month() + 1).padStart(2, '0')}`;
      }
      // 如果没有日期，使用year和week推算（可能不准确，但作为后备）
      const month = Math.floor((item.week - 1) / 4) + 1;
      return `${item.year}-${String(month).padStart(2, '0')}`;
    });
    const counts = weekDataArray.map(item => item.count);

    // 找到当前系列在主图表中的颜色（使用与上方图表相同的颜色分配逻辑）
    // 上方图表使用 selectedSectors 过滤后的索引来确定颜色
    const filteredSectors = data.filter(sector => selectedSectors.includes(sector.sectorStockCode));
    const sectorIndex = filteredSectors.findIndex(item => {
      const name = item.sectorStockName || item.sectorStockCode;
      return name === yearChartSectorName;
    });
    const colors = [
      '#ff4d4f', '#52c41a', '#1890ff', '#faad14', '#722ed1',
      '#eb2f96', '#13c2c2', '#fa8c16', '#2f54eb', '#a0d911'
    ];
    const color = sectorIndex >= 0 ? colors[sectorIndex % colors.length] : '#1890ff';

    return {
      title: {
        text: `${yearChartSectorName} - 最近一年涨停趋势`,
        left: 'center',
        top: '5px',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          const param = params[0];
          const dataIndex = param.dataIndex;
          const weekData = weekDataArray && weekDataArray[dataIndex];
          const dateRange = weekData && weekData.dates && weekData.dates.length > 0 
            ? `${weekData.dates[0]} ~ ${weekData.dates[weekData.dates.length - 1]}`
            : '';
          return `${param.name}<br/>涨停数量: <strong style="color: ${param.color};">${param.value}</strong>${dateRange ? `<br/>日期范围: ${dateRange}` : ''}`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '0%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: months,
        axisLine: {
          lineStyle: {
            color: '#ccc'
          }
        },
        axisLabel: {
          rotate: 45,
          fontSize: 10,
          // 只显示唯一的年月，避免重复
          interval: function(index, value) {
            // 如果当前值和前一个值相同，则不显示
            if (index > 0 && months[index - 1] === value) {
              return true; // 跳过显示
            }
            return false; // 显示
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '涨停数量',
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
      series: [
        {
          name: '涨停数量',
          type: 'line',
          data: counts,
          itemStyle: {
            color: color
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
                color: hexToRgba(color, 0.3)
              }, {
                offset: 1,
                color: hexToRgba(color, 0)
              }]
            }
          },
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 6,
          smooth: false,
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return params.value !== null && params.value !== undefined ? params.value : '';
            },
            fontSize: 10,
            color: '#333'
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            lineStyle: {
              color: '#ff4d4f',
              type: 'dashed',
              width: 1,
              opacity: 0.6
            },
            data: [
              // {
              //   yAxis: 15,
              //   label: {
              //     show: true,
              //     position: 'end',
              //     formatter: '15',
              //     fontSize: 12,
              //     color: '#ff4d4f',
              //     backgroundColor: 'transparent'
              //   }
              // }
            ]
          }
        }
      ]
    };
  }, [yearChartData, yearChartSectorName, data, selectedSectors]);

  // 生成3年图表的配置（使用 useMemo 缓存，避免不必要的重新渲染，按每两周聚合）
  const year3ChartOption = useMemo(() => {
    if (!year3ChartData || !Array.isArray(year3ChartData) || year3ChartData.length === 0) {
      return {
        title: {
          text: year3ChartSectorName ? `${year3ChartSectorName} - 最近三年涨停趋势` : '请在上方图表中选择一个板块',
          left: 'center',
        },
        xAxis: {
          type: 'category',
          data: []
        },
        yAxis: {
          type: 'value'
        },
        series: []
      };
    }

    // 确保数据按日期排序（从旧到新）
    const sortedData = [...year3ChartData].sort((a, b) => {
      return a.date.localeCompare(b.date);
    });
    
    // 按每两周聚合数据
    const biweekDataMap = new Map();
    
    sortedData.forEach(item => {
      if (item.date) {
        const dateObj = dayjs(item.date);
        const year = dateObj.year();
        const week = dateObj.week(); // ISO周数
        
        // 计算两周的起始周（每两周一组：1-2, 3-4, 5-6, ...）
        // biweekIndex: 0表示第1-2周，1表示第3-4周，以此类推
        const biweekIndex = Math.floor((week - 1) / 2);
        const startWeek = biweekIndex * 2 + 1;
        const endWeek = startWeek + 1;
        const biweekKey = `${year}-BW${String(biweekIndex + 1).padStart(2, '0')}`;
        
        if (!biweekDataMap.has(biweekKey)) {
          biweekDataMap.set(biweekKey, {
            biweekKey: biweekKey,
            year: year,
            biweekIndex: biweekIndex,
            startWeek: startWeek,
            endWeek: endWeek,
            count: 0,
            dates: []
          });
        }
        
        const biweekData = biweekDataMap.get(biweekKey);
        biweekData.count += (item.count || 0);
        biweekData.dates.push(item.date);
      }
    });
    
    // 转换为数组并按时间排序
    const biweekDataArray = Array.from(biweekDataMap.values()).sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      return a.biweekIndex - b.biweekIndex;
    });
    
    // 格式化X轴显示为年月（例如：2024-01）
    // 从dates数组中取第一个日期来确定月份
    const months = biweekDataArray.map(item => {
      if (item.dates && item.dates.length > 0) {
        const firstDate = dayjs(item.dates[0]);
        return `${firstDate.year()}-${String(firstDate.month() + 1).padStart(2, '0')}`;
      }
      // 如果没有日期，使用year和startWeek推算（可能不准确，但作为后备）
      const month = Math.floor((item.startWeek - 1) / 4) + 1;
      return `${item.year}-${String(month).padStart(2, '0')}`;
    });
    const counts = biweekDataArray.map(item => item.count);

    // 找到当前系列在主图表中的颜色（使用与上方图表相同的颜色分配逻辑）
    const filteredSectors = data.filter(sector => selectedSectors.includes(sector.sectorStockCode));
    const sectorIndex = filteredSectors.findIndex(item => {
      const name = item.sectorStockName || item.sectorStockCode;
      return name === year3ChartSectorName;
    });
    const colors = [
      '#ff4d4f', '#52c41a', '#1890ff', '#faad14', '#722ed1',
      '#eb2f96', '#13c2c2', '#fa8c16', '#2f54eb', '#a0d911'
    ];
    const color = sectorIndex >= 0 ? colors[sectorIndex % colors.length] : '#1890ff';

    return {
      title: {
        text: `${year3ChartSectorName} - 最近三年涨停趋势`,
        left: 'center',
        top: '5px',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          const param = params[0];
          const dataIndex = param.dataIndex;
          const biweekData = biweekDataArray && biweekDataArray[dataIndex];
          const dateRange = biweekData && biweekData.dates && biweekData.dates.length > 0 
            ? `${biweekData.dates[0]} ~ ${biweekData.dates[biweekData.dates.length - 1]}`
            : '';
          return `${param.name}<br/>涨停数量: <strong style="color: ${param.color};">${param.value}</strong>${dateRange ? `<br/>日期范围: ${dateRange}` : ''}`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '0%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: months,
        axisLine: {
          lineStyle: {
            color: '#ccc'
          }
        },
        axisLabel: {
          rotate: 45,
          fontSize: 10,
          // 只显示唯一的年月，避免重复
          interval: function(index, value) {
            // 如果当前值和前一个值相同，则不显示
            if (index > 0 && months[index - 1] === value) {
              return true; // 跳过显示
            }
            return false; // 显示
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '涨停数量',
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
      series: [
        {
          name: '涨停数量',
          type: 'line',
          data: counts,
          itemStyle: {
            color: color
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
                color: hexToRgba(color, 0.3)
              }, {
                offset: 1,
                color: hexToRgba(color, 0)
              }]
            }
          },
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 6,
          smooth: false,
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return params.value !== null && params.value !== undefined ? params.value : '';
            },
            fontSize: 10,
            color: '#333'
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            lineStyle: {
              color: '#ff4d4f',
              type: 'dashed',
              width: 1,
              opacity: 0.6
            },
            data: [
              // {
              //   yAxis: 15,
              //   label: {
              //     show: true,
              //     position: 'end',
              //     formatter: '15',
              //     fontSize: 12,
              //     color: '#ff4d4f',
              //     backgroundColor: 'transparent'
              //   }
              // }
            ]
          }
        }
      ]
    };
  }, [year3ChartData, year3ChartSectorName, data, selectedSectors]);

  // 生成上方图表的配置（使用 useMemo 缓存，避免不必要的重新渲染）
  const topChartOption = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return {
        title: {
          text: '板块涨停趋势',
          left: 'center',
        },
        xAxis: {
          type: 'category',
          data: []
        },
        yAxis: {
          type: 'value'
        },
        series: []
      };
    }

    // 如果没有选中的板块，返回提示信息
    if (!selectedSectors || selectedSectors.length === 0) {
      return {
        title: {
          text: '板块涨停趋势',
          left: 'center',
          subtext: '请在下方的表格中选择要显示的板块'
        },
        xAxis: {
          type: 'category',
          data: []
        },
        yAxis: {
          type: 'value'
        },
        series: []
      };
    }

    // 收集所有日期
    const allDates = new Set();
    data.forEach(sector => {
      if (sector.datas && Array.isArray(sector.datas)) {
        sector.datas.forEach(item => {
          if (item.date) {
            allDates.add(item.date);
          }
        });
      }
    });
    // 按日期排序（YYYY-MM-DD 格式可以直接字符串排序）
    const dates = Array.from(allDates).sort((a, b) => {
      return a.localeCompare(b);
    });


    // 为每个选中的板块创建一条线
    const series = data
      .filter(sector => selectedSectors.includes(sector.sectorStockCode))
      .map((sector, index) => {
        // 为每个日期找到对应的count值
        const countData = dates.map(date => {
          const item = sector.datas?.find(d => d.date === date);
          return item ? item.count : null;
        });

        // 生成颜色
        const colors = [
          '#ff4d4f', '#52c41a', '#1890ff', '#faad14', '#722ed1',
          '#eb2f96', '#13c2c2', '#fa8c16', '#2f54eb', '#a0d911'
        ];
        const color = colors[index % colors.length];
        
        const sectorName = sector.sectorStockName || sector.sectorStockCode;

        return {
          name: sectorName,
          type: 'line',
          data: countData,
          triggerEvent: true, // 启用事件触发，允许点击事件
          itemStyle: {
            color: color
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
                color: hexToRgba(color, 0.3)
              }, {
                offset: 1,
                color: hexToRgba(color, 0)
              }]
            }
          },
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 6,
          smooth: false,
          label: {
            show: true,
            position: 'top',
            formatter: function(params) {
              return params.value !== null && params.value !== undefined ? params.value : '';
            },
            fontSize: 10,
            color: '#333'
          },
          emphasis: {
            focus: 'series',
            label: {
              show: true,
              fontSize: 12,
              fontWeight: 'bold'
            }
          }
        };
      });

    // 添加一条全局的 y=15 红色虚线标记
    if (series.length > 0) {
      series[0].markLine = {
        silent: true,
        symbol: ['none', 'none'], // 去掉箭头
        lineStyle: {
          color: '#ff4d4f',
          type: 'dashed',
          width: 1,
          opacity: 0.6 // 降低透明度，使其不那么明显
        },
        data: [
          {
            yAxis: 15,
            label: {
              show: true,
              position: 'end',
              formatter: '15',
              fontSize: 12,
              color: '#ff4d4f',
              backgroundColor: 'transparent'
            }
          }
        ]
      };
    }

    return {
      title: {
        text: '板块涨停趋势',
        left: 'center',
        top: '5px',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        formatter: function (params) {
          if (params.value === null || params.value === undefined) {
            return '';
          }
          return `<div style="
            background-color: rgba(0, 0, 0, 0.7);
            color: #fff;
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          ">
            <div style="margin-bottom: 2px;">
              <span style="display:inline-block;width:8px;height:8px;background-color:${params.color};border-radius:50%;margin-right:6px;"></span>
              <strong>${params.seriesName}</strong>
            </div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.2);">
              ${params.name}: <strong style="color: ${params.color};">${params.value}</strong>
            </div>
          </div>`;
        }
      },
      legend: {
        data: data
          .filter(sector => selectedSectors.includes(sector.sectorStockCode))
          .map(sector => sector.sectorStockName || sector.sectorStockCode),
        top: '20px',
        type: 'scroll',
        orient: 'horizontal',
        left: 'center',
        itemGap: 15,
        textStyle: {
          fontSize: 11
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '0%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: {
          lineStyle: {
            color: '#ccc'
          }
        },
        axisLabel: {
          rotate: 45,
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        name: '涨停数量',
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
  }, [data, selectedSectors]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左侧板块列表 */}
      <div style={{
        width: '200px',
        backgroundColor: '#f5f5f5',
        borderRight: '1px solid #d9d9d9',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        {/* 日期选择和搜索框 */}
        <div style={{
          padding: '12px',
          borderBottom: '1px solid #d9d9d9',
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {/* 选择日期行 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>日期:</span>
            <DatePicker
              value={selectedDate}
              onChange={(date) => {
                if (date) {
                  setSelectedDate(date);
                }
              }}
              format="YYYY-MM-DD"
              style={{ flex: 1 }}
              allowClear={false}
              size="small"
            />
          </div>
          {/* 搜索板块行 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>板块:</span>
            <Input
              placeholder="输入板块名称搜索"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
              size="small"
              style={{ flex: 1 }}
            />
          </div>
        </div>
        
        {/* 可滚动板块列表 */}
        <div 
          ref={sectorListRef}
          tabIndex={0}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '4px 0',
            outline: 'none'
          }}
          onKeyDown={(e) => {
            const filteredSectors = allSectors.filter(sector => {
              if (!searchKeyword.trim()) {
                return true;
              }
              const keyword = searchKeyword.toLowerCase().trim();
              return sector.stockName && sector.stockName.toLowerCase().includes(keyword);
            });
            
            if (filteredSectors.length === 0) return;
            
            let newIndex = highlightedIndex;
            
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              // 如果当前没有高亮，从第一个开始；否则向下移动
              if (highlightedIndex < 0) {
                newIndex = 0;
              } else {
                newIndex = highlightedIndex < filteredSectors.length - 1 ? highlightedIndex + 1 : 0;
              }
              setHighlightedIndex(newIndex);
              // 滚动到可见区域
              setTimeout(() => scrollToHighlighted(newIndex), 0);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              // 如果当前没有高亮，从最后一个开始；否则向上移动
              if (highlightedIndex < 0) {
                newIndex = filteredSectors.length - 1;
              } else {
                newIndex = highlightedIndex > 0 ? highlightedIndex - 1 : filteredSectors.length - 1;
              }
              setHighlightedIndex(newIndex);
              // 滚动到可见区域
              setTimeout(() => scrollToHighlighted(newIndex), 0);
            } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < filteredSectors.length) {
              e.preventDefault();
              const sector = filteredSectors[highlightedIndex];
              if (sector) {
                const isSelected = selectedSectorCode === sector.stockCode;
                if (isSelected) {
                  setSelectedSectorCode(null);
                  setIsManualSelection(false);
                  setBottomChartData([]);
                  setBottomChartSectorName('');
                  setYearChartData([]);
                  setYearChartSectorName('');
                  setYear3ChartData([]);
                  setYear3ChartSectorName('');
                } else {
                  setSelectedSectorCode(sector.stockCode);
                  setIsManualSelection(true);
                  fetchNDaysDataRef.current?.(sector.stockCode, sector.stockName);
                }
              }
            }
          }}
        >
          {allSectors
            .filter(sector => {
              if (!searchKeyword.trim()) {
                return true;
              }
              const keyword = searchKeyword.toLowerCase().trim();
              return sector.stockName && sector.stockName.toLowerCase().includes(keyword);
            })
            .map((sector, index) => {
            const isSelected = selectedSectorCode === sector.stockCode;
            const isHighlighted = highlightedIndex === index;
            return (
              <div
                key={sector.stockCode}
                data-index={index}
                onClick={() => {
                  setHighlightedIndex(index);
                  if (isSelected) {
                    // 如果已选中，取消选择
                    setSelectedSectorCode(null);
                    setIsManualSelection(false);
                    // 清空下方图表数据
                    setBottomChartData([]);
                    setBottomChartSectorName('');
                    setYearChartData([]);
                    setYearChartSectorName('');
                    setYear3ChartData([]);
                    setYear3ChartSectorName('');
                  } else {
                    // 选择新板块
                    setSelectedSectorCode(sector.stockCode);
                    setIsManualSelection(true);
                    // 加载该板块的数据
                    fetchNDaysDataRef.current?.(sector.stockCode, sector.stockName);
                  }
                }}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? '#1890ff' : (isHighlighted ? '#e6f7ff' : 'transparent'),
                  color: isSelected ? '#fff' : '#333',
                  borderLeft: isSelected ? '3px solid #0050b3' : (isHighlighted ? '3px solid #1890ff' : '3px solid transparent'),
                  transition: 'all 0.2s',
                  fontSize: '13px'
                }}
                onMouseEnter={(e) => {
                  setHighlightedIndex(index);
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#e6f7ff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected && !isHighlighted) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                title={sector.stockName}
              >
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '2px',
                  flexWrap: 'wrap'
                }}>
                  <span style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: '0 1 auto'
                  }}>
                    {sector.stockName}
                  </span>
                  {sector.types && Array.isArray(sector.types) && sector.types.length > 0 && (
                    <div style={{ 
                      display: 'flex', 
                      gap: '2px', 
                      flexWrap: 'wrap',
                      flex: '0 1 auto'
                    }}>
                      {sector.types.map((type, index) => (
                        <Tag
                          key={index}
                          style={{
                            margin: 0,
                            fontSize: '10px',
                            padding: '0 4px',
                            height: '18px',
                            lineHeight: '18px',
                            backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.2)' : '#f0f0f0',
                            color: isSelected ? '#fff' : '#666',
                            border: isSelected ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid #d9d9d9'
                          }}
                        >
                          {type}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 中间股票列表 */}
      <div style={{
        width: '200px',
        backgroundColor: '#f5f5f5',
        borderRight: '1px solid #d9d9d9',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        <div style={{
          padding: '12px',
          borderBottom: '1px solid #d9d9d9',
          backgroundColor: '#fff'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
            {selectedSectorCode ? `板块股票列表 (${stockList.length})` : '请选择板块'}
          </div>
        </div>
        
        {/* 股票列表 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '4px 0'
        }}>
          {stockListLoading ? (
            <div style={{ textAlign: 'center', padding: '50px', color: '#999' }}>加载中...</div>
          ) : stockList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px', color: '#999' }}>
              {selectedSectorCode ? '暂无股票数据' : '请先选择板块'}
            </div>
          ) : (
            stockList.map((stock, index) => (
              <div
                key={stock.stockCode}
                style={{
                  padding: '10px 12px',
                  fontSize: '13px',
                  borderBottom: '1px solid #f0f0f0',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#e6f7ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#fff';
                }}
                onClick={(e) => {
                  // 只存储必要的字段，减少 sessionStorage 占用
                  const minimalStockList = stockList.map(item => ({
                    stockCode: item.stockCode,
                    stockName: item.stockName,
                    date: item.date,
                    priceLevel100: item.priceLevel100,
                    priceLevel200: item.priceLevel200,
                    priceLevel1000: item.priceLevel1000
                  }));
                  try {
                    sessionStorage.setItem('stockList', JSON.stringify(minimalStockList));
                  } catch (error) {
                    console.error('Failed to save stockList to sessionStorage:', error);
                    // 如果存储失败，尝试清除旧的存储后重试
                    try {
                      sessionStorage.removeItem('stockList');
                      sessionStorage.setItem('stockList', JSON.stringify(minimalStockList));
                    } catch (retryError) {
                      console.error('Retry failed:', retryError);
                    }
                  }
                  // 在新标签页打开详情页
                  window.open(`/stock-detail/${stock.stockCode}/latest?tab=stockSector`, '_blank');
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px'
                }}>
                  <span style={{ fontWeight: 'bold', color: '#333' }}>
                    {stock.stockName}
                  </span>
                  {stock.totalScore !== undefined && (
                    <span style={{ 
                      fontSize: '12px', 
                      color: stock.totalScore >= 0 ? '#52c41a' : '#ff4d4f',
                      fontWeight: 'bold'
                    }}>
                      {stock.totalScore.toFixed(2)}
                    </span>
                  )}
                  
                </div>
                <div style={{fontSize: '11px', color: '#666',}}>
                  价位：
                  <strong>
                  {stock.priceLevel100.toFixed(0)}%,{stock.priceLevel200.toFixed(0)}%,{stock.priceLevel1000.toFixed(0)}%
                  </strong>
                </div>
                  {(stock.closePrice !== undefined || stock.zhangDieFu !== undefined) && (
                    <div style={{ 
                      fontSize: '11px', 
                      color: '#666',
                      marginTop: '4px',
                      display: 'flex',
                      gap: '8px'
                    }}>
                      {stock.closePrice !== undefined && (
                        <span style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          minWidth: '70px'
                        }}>
                          股价: <strong style={{
                            color: stock.zhangDieFu > 0 ? '#ef232a' : stock.zhangDieFu < 0 ? '#14b143' : '#666',
                            marginLeft: '4px'
                          }}>{stock.closePrice.toFixed(2)}</strong>
                        </span>
                      )}
                      {stock.zhangDieFu !== undefined && (
                        <span style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          minWidth: '90px'
                        }}>
                          涨跌幅: <strong style={{
                            color: stock.zhangDieFu > 0 ? '#ef232a' : stock.zhangDieFu < 0 ? '#14b143' : '#666',
                            marginLeft: '4px'
                          }}>{stock.zhangDieFu >= 0 ? '+' : ''}{stock.zhangDieFu.toFixed(2)}%</strong>
                        </span>
                      )}
                    </div>
                  )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧内容区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', padding: '10px' }}>
        {/* 上方图表区域 - 占一半 */}
        <div style={{ 
          backgroundColor: '#fff',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '10px',
          padding: '10px',
          height: 'calc(50vh - 20px)',
          minHeight: '350px',
          flexShrink: 0
        }}>
          <ReactECharts
            option={topChartOption}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
            onChartReady={onChartReady}
            onEvents={{
              'click': handleChartClick,
              'legendselectchanged': handleChartClick // 也监听图例点击事件
            }}
            notMerge={true}
          />
        </div>

        {/* 下方图表区域 - 90天和一年垂直排列 */}
        {/* 90天图表 */}
        <div style={{ 
          backgroundColor: '#fff',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '10px',
          padding: '10px',
          height: 'calc(16.67vh - 20px)',
          minHeight: '200px',
          flexShrink: 0
        }}>
          {bottomChartLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>加载中...</div>
          ) : (
            <ReactECharts
              option={bottomChartOption}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'svg' }}
              notMerge={true}
            />
          )}
        </div>

        {/* 一年图表 */}
        <div style={{ 
          backgroundColor: '#fff',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '10px',
          padding: '10px',
          height: 'calc(16.67vh - 20px)',
          minHeight: '200px',
          flexShrink: 0
        }}>
          {yearChartLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>加载中...</div>
          ) : (
            <ReactECharts
              option={yearChartOption}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'svg' }}
              notMerge={true}
            />
          )}
        </div>

        {/* 3年图表 */}
        <div style={{ 
          backgroundColor: '#fff',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '10px',
          padding: '10px',
          height: 'calc(16.67vh - 20px)',
          minHeight: '200px',
          flexShrink: 0
        }}>
          {year3ChartLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>加载中...</div>
          ) : (
            <ReactECharts
              option={year3ChartOption}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'svg' }}
              notMerge={true}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SectorUpLimitTrend;
