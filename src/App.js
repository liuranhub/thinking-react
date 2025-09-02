import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import './App.css';
import StockList from './components/StockList';
import StockListV2 from './components/StockListV2';
import MarketTrend from './components/MarketTrend';
import StockDetail from './components/StockDetail';
import WatchConfigManagement from './components/WatchConfigManagement';

function Navigation() {
  const location = useLocation();
  
  return (
    <div style={{ 
      borderBottom: '1px solid #ccc',
      padding: '10px',
      marginBottom: '10px',
      display: 'flex',
      gap: '10px'
    }}>
      <Link to="/" className={location.pathname === '/' ? 'tab-button tab-button-active' : 'tab-button'}>
        股票列表
      </Link>
      <Link to="/market-trend" className={location.pathname === '/market-trend' ? 'tab-button tab-button-active' : 'tab-button'}>
        市场趋势
      </Link>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        {/* <Navigation /> */}
        <Routes>
          <Route path="/" element={<StockList />} />
          <Route path="/market-trend" element={<MarketTrend />} />
          <Route path="/stock-detail/:stockCode/:date" element={<StockDetail />} />
          <Route path="/watch-config" element={<WatchConfigManagement />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
