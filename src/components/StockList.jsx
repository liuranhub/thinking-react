import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import axios from 'axios';
import '../App.css';
import { FixedSizeList as List } from 'react-window';
import SearchModal from './SearchModal';
import debounce from 'lodash/debounce';
import { Select, Button } from 'antd';
import 'antd/dist/reset.css';
import { Link, useNavigate } from 'react-router-dom';
import { API_HOST } from '../config/config';

const StockList = () => {
  const host = API_HOST;

  const MODAL_TYPE_CONFIRM = 'CONFIRM'

  const TAB_ALL = 'all';
  const TAB_FAVORITES = 'favorites';
  const TAB_ALGORITHM = 'algorithm';
  const TAB_YAOGU = 'yaogu';
  const TAB_DECLINE = 'decline';

  // 初始化完成控制
  const [isInitFinished, setIsInitFinished] = useState(false);

  // 控制页签状态
  const [activeTab, setActiveTab] = useState(TAB_ALL); // 'all' 为所有股票，'favorites' 为我的收藏

  // 控制搜索弹窗状态
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  // 表头
  const [stockFieldConfigType, setStockFieldConfigType] = useState('default');
  const [stockFieldConfigTypes, setStockFieldConfigTypes] = useState([]);
  const [columns, setColumns] = useState([]);

  // 表格数据
  const [data, setData] = useState([]);
  const [matchedTags, setMatchedTags] = useState([]);
  const [total, setTotal] = useState(0);
  const [riseCount, setRiseCount] = useState(0);
  const [zhangTingCount, setZhangTingCount] = useState(0);

  // 搜索条件
  const [dates, setDates] = useState([]);
  const [selectedDates, setSelectedDates] = useState([]);
  const [date, setDate] = useState(''); // date查询条件
  const [fieldQueries, setFieldQueries] = useState({}); // 存储字段查询条件
  const [stockCode, setStockCode] = useState(''); // stockCode查询条件
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(5000);
  const [orderByField, setOrderByField] = useState('stockCode'); // 存储排序字段
  const [orderRule, setOrderRule] = useState('ASC'); // 存储排序规则，'ASC' 或 'DESC'

  const [nextClosePriceAnalysis, setNextClosePriceAnalysis] = useState('');
  
  // 初始化
  useEffect(() => {
    loadInitialData();
  }, []);

  // 获取表头配置
  useEffect(() => {
    getFieldConfigDetail();
  }, [stockFieldConfigType]);

  useEffect(() => {
    if (isInitFinished) {
      fetchData();
    }
  }, [isInitFinished, stockFieldConfigType, date, stockCode, fieldQueries, pageIndex, pageSize, orderByField, orderRule]);

  const loadInitialData = async () => {
    try {
      await getAllFieldConfigType();
      await getAllDate();
      setIsInitFinished(true);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const getAllFieldConfigType = async () => {
    const response = await axios.get(host + '/stock/stockFieldConfig/allType');
    setStockFieldConfigTypes(response.data);
  }

  const getAllDate = async () => { 
    const response = await axios.get(host + '/stock/getAllDate');
    const dates = [...response.data];
    // dates.unshift('');
    setDates(dates);
    setSelectedDates([dates[0]]); // 默认选择第一个有效日期
    setDate(dates[0]); // 保持向后兼容
  }

  const getFieldConfigDetail = async () => { 
    axios.get(host + '/stock/stockFieldConfig/' + stockFieldConfigType)
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
      setFieldQueries(newFieldQueries);
    });
  }

  const getStockDetail = async (stockCode) => {
    const response = await axios.get(host + '/stock/stockDetail/' + stockCode);
    return response.data;
  };


  const addFavorite = async (stockCode) => {
    await axios.post(host + '/stock/addFavorite', {
      stockCode: stockCode,
      nextClosePriceAnalysis: nextClosePriceAnalysis
    });
  };

  const removeFavorite = async (stockCode) => {
    await axios.post(host + '/stock/removeFavorite/' + stockCode, {});
  };

  const fetchData = async () => {
    console.log(activeTab);
    if(activeTab===TAB_ALL) {
      const response = await axios.post(host + '/stock/stockDataAnalysisPage', {
        pageSize,
        pageIndex,
        date,
        stockCode,
        orderByField,
        orderRule,
        fieldQuery: fieldQueries
      });
      setData(response.data.records);
      setMatchedTags(response.data.extInfo?.matchedTags)
      setTotal(response.data.total);
      setRiseCount(response.data.extInfo?.riseCount);
      setZhangTingCount(response.data.extInfo?.zhangTingCount);
    } else if(activeTab === TAB_FAVORITES) {
      const response = await axios.post(host + '/stock/stockDataFavoritePage', {
        pageSize,
        pageIndex,
        date,
        stockCode,
        orderByField,
        orderRule,
        fieldQuery: fieldQueries
      });
      setData(response.data.records);
      setMatchedTags(response.data.extInfo?.matchedTags)
      setTotal(response.data.total);
    } else if (activeTab === TAB_ALGORITHM) {
      const response = await axios.post(host + '/stock/stockDataAnalysisMatchAlgorithmPage', {
        pageSize,
        pageIndex,
        date,
        stockCode,
        orderByField,
        orderRule,
        fieldQuery: fieldQueries
      });
      setData(response.data.records);
      setMatchedTags(response.data.extInfo?.matchedTags)
      setTotal(response.data.total);
    } else if (activeTab === TAB_YAOGU) {
      const response = await axios.post(host + '/stock/stockDataYaoguPage', {
        pageSize,
        pageIndex,
        date,
        stockCode,
        orderByField,
        orderRule,
        fieldQuery: fieldQueries
      });
      setData(response.data.records);
      setMatchedTags(response.data.extInfo?.matchedTags)
      setTotal(response.data.total);
    } else if (activeTab === TAB_DECLINE) {
      const response = await axios.post(host + '/stock/stockDataAnalysisPage', {
        pageSize,
        pageIndex,
        date,
        stockCode,
        orderByField,
        orderRule,
        fieldQuery: fieldQueries,
        matchedAlgorithm: "INCREMENTAL_DECLINE"
      });
      setData(response.data.records);
      setMatchedTags(response.data.extInfo?.matchedTags)
      setTotal(response.data.total);
    }
  };

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

  // 处理表头点击事件
  const handleHeaderClick = (field) => {
    let newOrderRule = 'ASC';
    if (orderByField === field && orderRule === 'ASC') {
      newOrderRule = 'DESC';
    }
    setOrderByField(field);
    setOrderRule(newOrderRule);
    setPageIndex(1); // Reset to first page when sorting
  };

  const handleAddFavoriteClick = (row) => {
    console.log("add favorite:", row)
    addFavorite(row.stockCode);
    setNextClosePriceAnalysis(null);
  }

  // 处理收藏按钮点击事件
  const handleRemoveFavoriteClick = (row) => {
    removeFavorite(row.stockCode)// 显示弹窗
  };

  const handleSearchModalToggle = () => {
    setSearchModalVisible(!searchModalVisible);
  };

  // 页签切换函数
  const handleTabChange = (tab) => {
    if(tab === TAB_ALL) {
        setStockFieldConfigType('default');
        setPageSize(5000);
    } 
    if(tab === TAB_FAVORITES) {
      setStockFieldConfigType('favorite');
      setPageSize(5000);
    }
    if(tab === TAB_ALGORITHM) {
      setStockFieldConfigType('favorite');
      setPageSize(5000);
    }
    if(tab === TAB_YAOGU) {
      setStockFieldConfigType('simple');
      setPageSize(5000);
    }
    if(tab === TAB_DECLINE) {
      setStockFieldConfigType('simple');
      setPageSize(5000);
    }
    setActiveTab(tab);
  };
  
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

    const OPERATIONS_WIDTH = 10 + useMemo(() => {
      return operations.reduce((total, operation) => {
        const operationWidth = operation.width || 40;
        return total + operationWidth;
      }, 0);
    }, [operations]);
    
    const SIDE_BAR_WIDTH = 0; // 不再使用侧边栏

    const PADDING_AND_BORDER = columns.length * 1;
    
    const BASE_WIDTH = (dimensions.width - SIDE_BAR_WIDTH - OPERATIONS_WIDTH - PADDING_AND_BORDER) / columns.length;

    // 使用 useMemo 缓存列宽计算结果
    const columnWidths = useMemo(() => {
      const CHAR_WIDTH = 8;
      const PADDING = 16;
      const MIN_WIDTH = BASE_WIDTH;
      const MAX_WIDTH = 100;
      
      const widths = new Map();
      
      columns.forEach(column => {
        let maxWidth = column.fieldName.length * CHAR_WIDTH;
        const sampleSize = Math.min(500, data.length);
        for (let i = 0; i < sampleSize; i++) {
          const content = String(data[i][column.field]);
          const contentWidth = content.length * CHAR_WIDTH;
          maxWidth = Math.max(maxWidth, contentWidth);
        }
        
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
            className={orderByField === column.field && orderRule === 'ASC' ? 'sorted-asc' : (orderByField === column.field && orderRule === 'DESC' ? 'sorted-desc' : '')}
          >
            {column.fieldName}
          </div>
        ))}
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
                  to={`/stock-detail/${row.stockCode}/${row.date}`}
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

        {operations.map((operation, opIndex) => (
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
  const handleSearchModalSearch = useCallback((values) => {
    // 更新所有状态
    console.log("handleSearchModalSearch", values);
    setStockFieldConfigType(values.stockFieldConfigType);
    setDate(values.date);
    setStockCode(values.stockCode);
    setFieldQueries(values.fieldQueries);
    setPageIndex(values.pageIndex);
    setPageSize(values.pageSize);
  }, []);

  const [searchKeyWordTmp, setSearchKeyWordTmp] = useState('')

  const debouncedSetSearchKeyWord = useCallback(
    debounce((value) => {
      setSearchKeyWordTmp(value);
    }, 300),
    []
  );

  return (
    <div style={{ 
      height: '100vh',
      fontSize:'12px', 
      fontWeight: 'bold' 
    }}>
      {/* 搜索弹窗 */}
      <SearchModal
        visible={searchModalVisible}
        onCancel={() => setSearchModalVisible(false)}
        stockFieldConfigTypes={stockFieldConfigTypes}
        dates={dates}
        initialValues={{
          stockFieldConfigType,
          date,
          stockCode,
          fieldQueries,
          pageIndex,
          pageSize
        }}
        onSearch={handleSearchModalSearch}
        total={total}
      />
      
      <div style={{ overflowY: 'hidden' }}>
        <div style={{ borderBottom: '1px solid #BEBEBE', marginBottom: '2px'}}>
          <button
            onClick={() => handleTabChange(TAB_ALL)}
            style={{ marginRight: '2px' }}
            className={activeTab === TAB_ALL ? 'tab-button tab-button-active' : 'tab-button'}
          >
            {activeTab === TAB_ALL ? '所有股票' : '所有股票'}
          </button>
          <button
            style={{ marginRight: '2px' }}
            onClick={() => handleTabChange(TAB_FAVORITES)}
            className={activeTab === TAB_FAVORITES ? 'tab-button tab-button-active' : 'tab-button'}
          >
            {activeTab === TAB_FAVORITES ? '我的收藏' : '我的收藏'}
          </button>

          <button
            style={{ marginRight: '2px' }}
            onClick={() => handleTabChange(TAB_YAOGU)}
            className={activeTab === TAB_YAOGU ? 'tab-button tab-button-active' : 'tab-button'}
          >
            {activeTab === TAB_YAOGU ? '妖股' : '妖股'}
          </button>

          <button
            style={{ marginRight: '2px' }}
            onClick={() => handleTabChange(TAB_DECLINE)}
            className={activeTab === TAB_DECLINE ? 'tab-button tab-button-active' : 'tab-button'}
          >
            {activeTab === TAB_DECLINE ? '增量下跌' : '增量下跌'}
          </button>

          {/* <Button
            type="primary"
            style={{marginLeft: '10px'}}
            onClick={handleSearchModalToggle}
          >
            高级搜索
          </Button> */}

          <span style={{ 
            marginLeft: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            height: '24px'
          }}>表头:</span>
          <select 
            value={stockFieldConfigType} 
            onChange={(e) => setStockFieldConfigType(e.target.value)}
          >
            {stockFieldConfigTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          {/* 日期选择，仅非妖股tab显示 */}
          {activeTab !== TAB_YAOGU && (
            <>
              <span style={{ 
                marginLeft: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                height: '24px'
              }}>日期:</span>
              <Select
                mode="multiple"
                value={selectedDates}
                onChange={(values) => {
                  setSelectedDates(values);
                  setDate(values.join(','));
                }}
                style={{
                  width: '120px',
                  minWidth: '120px',
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

          <span style={{ marginLeft: '10px' }}>关键字:</span>
          <input
            style={{ 
              width: '100px',
              border: '1px solid #ccc',
              borderRadius: '2px',
              padding: '2px 4px',
              outline: 'none',
              fontSize: '12px',
              '&:focus': {
                border: '1px solid #ccc',
                boxShadow: 'none'
              }
            }}
            onChange={(e) => {
              const value = e.target.value;
              e.target.value = value; // 直接更新 DOM 值，避免输入延迟
              // debouncedSetSearchKeyWord(value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setStockCode(e.target.value); // 使用当前输入框的值而不是 searchKeyWordTmp
              }
            }}
          />

          <span style={{ marginLeft: '10px' }}>
            总数:{total}
          </span>
          
          <span style={{ marginLeft: '10px' }}>
            上涨:{riseCount}
          </span>
          <span style={{ marginLeft: '10px' }}>
            涨停:{zhangTingCount}
          </span>

          <Link 
            to="/market-trend" 
            // target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: 'none',
              padding: '4px 15px',
              borderRadius: '4px',
              transition: 'background-color 0.3s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f5ff'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            市场趋势
          </Link>

          <Link 
            to="/watch-config" 
            // target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: 'none',
              padding: '4px 15px',
              borderRadius: '4px',
              transition: 'background-color 0.3s',
              marginLeft: '10px',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f5ff'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            监控配置
          </Link>

          <span style={{ marginLeft: '10px' }}>标签:</span>
          <span style={{ marginLeft: '10px', color: '#555' }}>
            {matchedTags?.join(', ')}
          </span>

        </div>

        {activeTab === TAB_ALL && 
          (<StockTable
            columns={columns}
            data={data}
            operations={[{
              modalType: MODAL_TYPE_CONFIRM,
              name: "收藏",
              handler: handleAddFavoriteClick,
            }]}
          />)
        }

        {activeTab ===TAB_FAVORITES && 
          (<StockTable
            columns={columns}
            data={data}
            operations={[{
              modalType: MODAL_TYPE_CONFIRM,
              name: "取消收藏",
              handler: handleRemoveFavoriteClick,
              width: 60
            }]}
          />)
        }

        {activeTab === TAB_YAOGU && (
          <StockTable
            columns={columns}
            data={data}
            operations={[]}
          />
        )}

        {activeTab === TAB_ALGORITHM && 
          (<StockTable
            columns={columns}
            data={data}
            operations={[{
              modalType: MODAL_TYPE_CONFIRM,
              name: "收藏",
              handler: handleAddFavoriteClick,
              width: 40
            }]}
          />)
        }
        {activeTab === TAB_DECLINE && 
          (<StockTable
            columns={columns}
            data={data}
            operations={[{
              modalType: MODAL_TYPE_CONFIRM,
              name: "收藏",
              handler: handleAddFavoriteClick,
              width: 40
            }]}
          />)
        }
      </div>
    </div>
  );
};

export default StockList;