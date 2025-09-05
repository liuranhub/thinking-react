import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_HOST } from '../config/config';
import './WatchStockH5.css';

const WatchStockH5 = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState('监控股票');

  // 获取监控股票数据
  const fetchWatchStockData = async () => {
    try {
      setLoading(true);
      const response = await axios.post(API_HOST + '/stock/stockDataWatchedPage', {
        pageSize: 1000, // 不分页，获取所有数据
        pageIndex: 1,
        keywords: '',
        stockTypes: [],
        orderByField: 'stockCode',
        orderRule: 'ASC',
        fieldQuery: {}
      });

      if (response.data && response.data.records) {
        setData(response.data.records);
        
        // 设置页面标题，取第一条数据的date字段
        if (response.data.records.length > 0 && response.data.records[0].date) {
          const date = response.data.records[0].date;
          // 格式化日期为 MM-DD 格式
          const formattedDate = date.substring(5, 10); // 从 YYYY-MM-DD 中提取 MM-DD
          setPageTitle(`监控股票(${date})`);
        }
      }
    } catch (error) {
      console.error('获取监控股票数据失败:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchStockData();
  }, []);

  // 格式化目标价差百分比
  const formatTargetPriceIntervalPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(2)}%`;
  };

  // 格式化价格
  const formatPrice = (value) => {
    if (value === null || value === undefined) return '-';
    return value.toFixed(2);
  };

  if (loading) {
    return (
      <div className="watch-stock-h5">
        <div className="loading">
          <div className="loading-spinner"></div>
          <div className="loading-text">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="watch-stock-h5">
      <div className="page-header">
        <h1 className="page-title">{pageTitle}</h1>
      </div>
      
      <div className="table-container">
        <table className="stock-table">
          <thead>
            <tr>
              <th className="col-stock-code">股票代码</th>
              <th className="col-stock-name">股票名称</th>
              <th className="col-close-price">收盘价</th>
              <th className="col-target-price">目标价格</th>
              <th className="col-target-price-interval">目标价差%</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-data">
                  暂无监控股票数据
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr key={`${item.stockCode}-${index}`} className="stock-row">
                  <td className="col-stock-code">{item.stockCode}</td>
                  <td className="col-stock-name">{item.stockName}</td>
                  <td className="col-close-price">{formatPrice(item.closePrice)}</td>
                  <td className="col-target-price">{formatPrice(item.targetPrice)}</td>
                  <td className="col-target-price-interval">
                    {formatTargetPriceIntervalPercent(item.targetPriceIntervalPrecent)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WatchStockH5;
