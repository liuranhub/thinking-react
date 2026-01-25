import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import './App.css';
import StockList from './components/StockList';
import MarketTrend from './components/MarketTrend';
import StockDetail from './components/StockDetail';
import WatchConfigManagement from './components/WatchConfigManagement';
import WatchStockH5 from './components/WatchStockH5';
import AuthGuard from './components/AuthGuard';

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

// PWA 主题控制器，用于动态切换菜单栏/状态栏主题
function PWAThemeController() {
  const location = useLocation();

  useEffect(() => {
    // 判断当前路由是否为详情页
    const isDetailPage = location.pathname.startsWith('/stock-detail');
    
    // 详情页使用与背景色一致的主题色（#181c26），列表页使用白色主题
    const themeColor = isDetailPage ? '#181c26' : '#ffffff';
    const backgroundColor = isDetailPage ? '#181c26' : '#ffffff';
    
    // 更新或创建 theme-color meta 标签
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.setAttribute('name', 'theme-color');
      document.getElementsByTagName('head')[0].appendChild(themeColorMeta);
    }
    themeColorMeta.setAttribute('content', themeColor);
    
    // 设置 HTML 和 Body 的背景色（iOS PWA 使用 black-translucent 模式时，页面背景会延伸到状态栏）
    document.documentElement.style.backgroundColor = backgroundColor;
    document.body.style.backgroundColor = backgroundColor;
    
    // 设置 CSS 变量，供其他组件使用
    document.documentElement.style.setProperty('--pwa-theme-color', themeColor);
    document.documentElement.style.setProperty('--pwa-background-color', backgroundColor);
    
  }, [location.pathname]);

  return null; // 不渲染任何内容
}

function App() {
  return (
    <AuthGuard>
      <Router>
        <PWAThemeController />
        <div className="App">
          {/* <Navigation /> */}
          <Routes>
            <Route path="/" element={<StockList />} />
            <Route path="/h5/watchStock" element={<WatchStockH5 />} />
            <Route path="/market-trend" element={<MarketTrend />} />
            <Route path="/stock-detail/:stockCode/:date" element={<StockDetail />} />
            <Route path="/watch-config" element={<WatchConfigManagement />} />
          </Routes>
        </div>
      </Router>
    </AuthGuard>
  );
}

export default App;
