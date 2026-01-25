/**
 * 统一的 HTTP 客户端
 * 自动在所有请求中添加 Authorization header
 * 提供 get、post、put、delete 方法
 */

import { getAuthorization, clearAuthorization } from './auth';

/**
 * 处理响应，自动解析 JSON 并处理错误
 * @param {Response} response - fetch 响应
 * @returns {Promise<any>} 解析后的数据
 */
const handleResponse = async (response) => {
  // 处理 401 认证错误
  if (response.status === 401) {
    // 清除本地存储的认证信息（异步，但不阻塞）
    clearAuthorization().catch(err => {
      console.error('清除 Authorization 失败:', err);
    });
    // 触发自定义事件，通知 AuthGuard 组件显示登录界面
    window.dispatchEvent(new CustomEvent('unauthorized'));
    // 直接返回，不抛出错误，避免显示错误信息
    return null;
  }

  // 检查响应状态
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  // 尝试解析 JSON，如果失败则返回文本
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  
  return await response.text();
};

/**
 * 构建请求配置，自动添加 Authorization header
 * @param {RequestInit} options - 原始请求选项
 * @returns {Promise<RequestInit>} 处理后的请求选项
 */
const buildRequestOptions = async (options = {}) => {
  const authToken = await getAuthorization();
  
  // 合并 headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (authToken) {
    headers['Authorization'] = authToken;
  }
  
  return {
    ...options,
    headers,
  };
};

/**
 * GET 请求
 * @param {string} url - 请求 URL
 * @param {RequestInit} options - 请求选项
 * @returns {Promise<any>} 响应数据
 */
export const get = async (url, options = {}) => {
  const requestOptions = await buildRequestOptions(options);
  const response = await fetch(url, {
    ...requestOptions,
    method: 'GET',
  });
  
  return handleResponse(response);
};

/**
 * POST 请求
 * @param {string} url - 请求 URL
 * @param {any} data - 请求体数据（会自动序列化为 JSON）
 * @param {RequestInit} options - 请求选项
 * @returns {Promise<any>} 响应数据
 */
export const post = async (url, data = null, options = {}) => {
  const requestOptions = await buildRequestOptions(options);
  
  // 如果有数据且 Content-Type 是 application/json，则序列化
  if (data !== null && requestOptions.headers['Content-Type'] === 'application/json') {
    requestOptions.body = JSON.stringify(data);
  } else if (data !== null && options.body === undefined) {
    // 如果用户没有提供 body，但有 data，则使用 data 作为 body
    requestOptions.body = data;
  }
  
  const response = await fetch(url, {
    ...requestOptions,
    method: 'POST',
  });
  
  return handleResponse(response);
};

/**
 * PUT 请求
 * @param {string} url - 请求 URL
 * @param {any} data - 请求体数据（会自动序列化为 JSON）
 * @param {RequestInit} options - 请求选项
 * @returns {Promise<any>} 响应数据
 */
export const put = async (url, data = null, options = {}) => {
  const requestOptions = await buildRequestOptions(options);
  
  // 如果有数据且 Content-Type 是 application/json，则序列化
  if (data !== null && requestOptions.headers['Content-Type'] === 'application/json') {
    requestOptions.body = JSON.stringify(data);
  } else if (data !== null && options.body === undefined) {
    requestOptions.body = data;
  }
  
  const response = await fetch(url, {
    ...requestOptions,
    method: 'PUT',
  });
  
  return handleResponse(response);
};

/**
 * DELETE 请求
 * @param {string} url - 请求 URL
 * @param {RequestInit} options - 请求选项
 * @returns {Promise<any>} 响应数据
 */
export const del = async (url, options = {}) => {
  const requestOptions = await buildRequestOptions(options);
  const response = await fetch(url, {
    ...requestOptions,
    method: 'DELETE',
  });
  
  return handleResponse(response);
};

// 导出 delete 作为 del 的别名（因为 delete 是 JavaScript 的保留字）
export { del as delete };

/**
 * 默认导出，包含所有方法
 */
export default {
  get,
  post,
  put,
  delete: del,
  del,
};
