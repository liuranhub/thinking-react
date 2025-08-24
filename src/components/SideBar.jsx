import React, { memo, useState, useEffect } from 'react';

const SideBar = memo(({ 
  stockFieldConfigTypes,
  dates,
  initialValues,
  onSearch,
  total
}) => {
  // 使用本地状态管理所有输入值
  const [formValues, setFormValues] = useState({
    stockFieldConfigType: initialValues.stockFieldConfigType,
    date: initialValues.date,
    stockCode: initialValues.stockCode,
    fieldQueries: initialValues.fieldQueries || {},
    pageIndex: initialValues.pageIndex,
    pageSize: initialValues.pageSize
  });

  // 当 initialValues 变化时更新本地状态
  useEffect(() => {
    setFormValues({
      stockFieldConfigType: initialValues.stockFieldConfigType,
      date: initialValues.date,
      stockCode: initialValues.stockCode,
      fieldQueries: initialValues.fieldQueries || {},
      pageIndex: initialValues.pageIndex,
      pageSize: initialValues.pageSize
    });
  }, [initialValues]);

  // 本地更新函数
  const handleInputChange = (field, value) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 处理字段查询条件变化
  const handleFieldQueryChange = (field, value, type) => {
    const newFieldQueries = { ...formValues.fieldQueries };
    if (!newFieldQueries[field]) {
      newFieldQueries[field] = { start: '', end: '', fieldName: field };
    }
    newFieldQueries[field] = { 
      ...newFieldQueries[field], 
      [type]: value 
    };
    handleInputChange('fieldQueries', newFieldQueries);
  };

  // 在 SideBar 组件中添加查询处理函数
  const handleSearch = () => {
    // 直接使用 formValues 中的数据
    const searchValues = {
      stockFieldConfigType: formValues.stockFieldConfigType,
      date: formValues.date,
      stockCode: formValues.stockCode,
      fieldQueries: formValues.fieldQueries,
      pageIndex: formValues.pageIndex,
      pageSize: formValues.pageSize
    };
    
    // 调用父组件的搜索函数
    onSearch(searchValues);
  };

  // 添加键盘事件处理函数
  const handleKeyDown = (event) => {
    // 检查是否按下了 CMD + Enter (Mac) 或 Ctrl + Enter (Windows)
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault(); // 阻止默认行为
      handleSearch(); // 触发搜索
    }
  };

  // 添加键盘事件监听
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [formValues]); // 依赖于 formValues，确保使用最新的状态

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      width: '150px',
      maxHeight: '100vh',
      padding: '2px',
      fontSize: '12px',
      fontWeight: 'bold',
      backgroundColor: '#f9f9f9',
      borderRight: '1px solid #ccc'
    }}>
      表配置类型:
      <br />
      <select 
        value={formValues.stockFieldConfigType} 
        onChange={(e) => handleInputChange('stockFieldConfigType', e.target.value)}
      >
        {stockFieldConfigTypes.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <br />
      日期:
      <br />
      <select 
        value={formValues.date} 
        onChange={(e) => handleInputChange('date', e.target.value)}
      >
        {dates.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <br />
      关键字:
      <br />
      <textarea
        style={{ width: '95%', height: '100px', overflowY: 'auto' }}
        value={formValues.stockCode}
        onChange={(e) => handleInputChange('stockCode', e.target.value)}
      />

      <div style={{ minWidth: '100%', backgroundColor: '#f9f9f9', borderRight: '1px solid #ccc' }}>
        {Object.entries(formValues.fieldQueries || {}).map(([field, query]) => (
          <div key={field}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
              <span>{query.fieldName || field}:</span>
              <input
                type="text"
                value={query.start || ''}
                onChange={(e) => handleFieldQueryChange(field, e.target.value, 'start')}
                className="field-query-input"
                style={{ marginLeft: '4px' }}
              />
              <span style={{ margin: '0 4px' }}>,</span>
              <input
                type="text"
                value={query.end || ''}
                onChange={(e) => handleFieldQueryChange(field, e.target.value, 'end')}
                className="field-query-input"
              />
            </div>
          </div>
        ))}
      </div>

      <button 
        onClick={handleSearch} 
        style={{ 
          width: '100%',
          height: '20px',
          marginTop: '10px',
          marginBottom: '10px',
        }}
      >
        查询
      </button>

      <div>
        <button 
          onClick={() => handleInputChange('pageIndex', formValues.pageIndex - 1)} 
          disabled={formValues.pageIndex === 1}
        >
          上一页
        </button>
        <button 
          onClick={() => handleInputChange('pageIndex', formValues.pageIndex + 1)} 
          disabled={formValues.pageIndex * formValues.pageSize >= total}
        >
          下一页
        </button>
        <select 
          value={formValues.pageSize} 
          onChange={(e) => {
            handleInputChange('pageSize', Number(e.target.value));
            handleInputChange('pageIndex', 1);
          }}
        >
          <option value={50}>50</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
          <option value={2000}>2000</option>
          <option value={5000}>5000</option>
        </select>
        <br />
        <span>
          Total:{total},Page:{formValues.pageIndex}/{Math.ceil(total / formValues.pageSize)}
        </span>
      </div>
    </div>
  );
});

export default SideBar; 