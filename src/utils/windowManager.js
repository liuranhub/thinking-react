// 全局窗口管理器
// 用于管理通过 window.open 打开的窗口，确保相同唯一标识的窗口只打开一个

// 存储已打开的窗口引用和定时器（使用单例模式）
const openWindowsMap = new Map();
const windowCheckIntervalsMap = new Map();

/**
 * 统一的窗口打开函数：如果相同窗口名称的窗口已打开，则先关闭再打开
 * @param {string} url - 要打开的URL
 * @param {string} [windowName] - 窗口名称，同时用作唯一标识（用于判断是否重复）、窗口名称（用于窗口复用）和窗口标题。如果不提供，则从URL中提取第一个路径段
 */
export const openWindow = (url, windowName) => {
  // 如果没有提供窗口名称，则从URL中提取第一个路径段
  let key = windowName;
  if (!key) {
    const pathname = url.split('?')[0]; // 先去掉查询参数
    const pathSegments = pathname.split('/').filter(Boolean); // 分割路径并过滤空字符串
    key = pathSegments[0] || 'default'; // 取第一个路径段，如果没有则使用 'default'
  }
  
  // windowName 同时用作唯一标识（key）、窗口名称（name）和窗口标题
  const name = key;
  
  // 将窗口名称作为标题添加到 URL 参数中
  let finalUrl = url;
  const separator = url.includes('?') ? '&' : '?';
  finalUrl = `${url}${separator}_windowTitle=${encodeURIComponent(name)}`;
  
  // 检查是否已有相同窗口名称的窗口打开
  const existingWindow = openWindowsMap.get(key);
  if (existingWindow && !existingWindow.closed) {
    // 如果窗口还存在且未关闭，先关闭它
    existingWindow.close();
    // 清理对应的定时器
    const existingInterval = windowCheckIntervalsMap.get(key);
    if (existingInterval) {
      clearInterval(existingInterval);
      windowCheckIntervalsMap.delete(key);
    }
  }
  
  // 打开新窗口，使用窗口名称而不是 '_blank'
  // 注意：窗口名称主要用于窗口复用，标签页标题需要在目标页面中设置
  const newWindow = window.open(finalUrl, name);
  
  if (newWindow) {
    // 使用窗口名称作为 key 保存窗口引用
    openWindowsMap.set(key, newWindow);
    
    // 监听窗口关闭事件，从Map中移除引用
    const checkClosed = setInterval(() => {
      if (newWindow.closed) {
        openWindowsMap.delete(key);
        const interval = windowCheckIntervalsMap.get(key);
        if (interval) {
          clearInterval(interval);
          windowCheckIntervalsMap.delete(key);
        }
      }
    }, 100);
    
    // 保存定时器引用（使用窗口名称作为 key）
    windowCheckIntervalsMap.set(key, checkClosed);
  }
};

/**
 * 清理所有窗口和定时器（通常在应用卸载时调用）
 */
export const cleanupAllWindows = () => {
  // 清理所有窗口检查定时器
  windowCheckIntervalsMap.forEach((interval) => {
    clearInterval(interval);
  });
  windowCheckIntervalsMap.clear();
  // 清理窗口引用
  openWindowsMap.clear();
};
