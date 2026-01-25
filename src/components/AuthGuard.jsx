import React, { useState, useEffect } from 'react';
import { isAuthenticated, setAuthorization } from '../utils/auth';
import './AuthGuard.css';

/**
 * 认证守卫组件
 * 检查 IndexedDB 中的 Authorization，如果不存在则显示输入框
 * 监听 401 错误事件，自动显示登录界面
 */
function AuthGuard({ children }) {
  const [isAuth, setIsAuth] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 从 IndexedDB 检查认证状态
    const checkAuth = async () => {
      setLoading(true);
      const authenticated = await isAuthenticated();
      setIsAuth(authenticated);
      setLoading(false);
    };

    checkAuth();

    // 监听 401 错误事件
    const handleUnauthorized = () => {
      setIsAuth(false);
      setError('认证已失效，请重新输入 Authorization');
    };

    window.addEventListener('unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!authInput.trim()) {
      setError('请输入 Authorization');
      return;
    }

    try {
      await setAuthorization(authInput.trim());
      setIsAuth(true);
      setAuthInput('');
      // 刷新页面以确保所有请求都使用新的 Authorization
      window.location.reload();
    } catch (error) {
      console.error('保存 Authorization 失败:', error);
      setError('保存失败，请重试');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  const handleInputChange = (e) => {
    setAuthInput(e.target.value);
    if (error) {
      setError('');
    }
  };

  // 加载中显示空白或加载提示
  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <div className="auth-header">
            <h2>加载中...</h2>
          </div>
        </div>
      </div>
    );
  }

  // 如果已认证，渲染子组件
  if (isAuth) {
    return <>{children}</>;
  }

  // 如果未认证，显示输入框
  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-header">
          <h2>认证</h2>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <input
              id="auth-input"
              type="password"
              value={authInput}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="请输入您的 Authorization 令牌"
              className="auth-input"
              autoFocus
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={!authInput.trim()}
            className="auth-button"
          >
            确认
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthGuard;
