import React, { useState, useEffect } from 'react';
import { isAuthenticated, setAuthorization } from '../utils/auth';
import { API_HOST } from '../config/config';
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
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // 从 IndexedDB 检查认证状态
    const checkAuth = async () => {
      try {
        const authenticated = await isAuthenticated();
        setIsAuth(authenticated);
      } catch (error) {
        console.error('检查认证状态失败:', error);
        setIsAuth(false);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    checkAuth();

    // 监听 401 错误事件
    const handleUnauthorized = () => {
      setIsAuth(false);
      setAuthInput(''); // 清除之前输入的内容
      setError(''); // 清除错误信息
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

    const authToken = authInput.trim();

    try {
      // 先调用 /auth/login 接口验证 Authorization
      const response = await fetch(`${API_HOST}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        },
      });

      // 检查响应状态
      if (response.status !== 200) {
        const errorText = await response.text();
        setError('认证失败，请检查 Authorization 是否正确');
        return;
      }

      // 认证成功，保存 Authorization
      await setAuthorization(authToken);
      setIsAuth(true);
      setAuthInput('');
      // 刷新页面以确保所有请求都使用新的 Authorization
      window.location.reload();
    } catch (error) {
      console.error('认证失败:', error);
      setError('认证失败，请检查网络连接或重试');
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

  // 加载中且未初始化时，如果已认证则直接渲染子组件，避免闪烁
  // 如果未认证，返回 null（不显示任何内容），避免闪烁
  if (loading && !initialized) {
    // 如果已经认证，直接渲染子组件，避免闪烁
    if (isAuth) {
      return <>{children}</>;
    }
    // 如果未认证且未初始化，返回 null（不显示加载提示），避免闪烁
    return null;
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
              placeholder="请输入您的令牌"
              className="auth-input"
              autoFocus
              autoComplete="off"
            />
            {error && <div className="auth-error">{error}</div>}
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
