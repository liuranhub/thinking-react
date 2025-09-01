import React, { memo, useState, useEffect } from 'react';
import { Modal, Form, Select, Input, Button, Space, Divider } from 'antd';

const { TextArea } = Input;

const SearchModal = memo(({ 
  visible,
  onCancel,
  stockFieldConfigTypes,
  dates,
  initialValues,
  onSearch,
  total
}) => {
  const [form] = Form.useForm();

  // 使用本地状态管理所有输入值
  const [formValues, setFormValues] = useState({
    stockFieldConfigType: initialValues.stockFieldConfigType,
    date: initialValues.date,
    stockCode: initialValues.stockCode,
    fieldQueries: initialValues.fieldQueries || {},
    pageIndex: 1,
    pageSize: 5000
  });

  // 当 initialValues 变化时更新本地状态
  useEffect(() => {
    console.log('SearchModal initialValues:', initialValues);
    console.log('stockFieldConfigTypes:', stockFieldConfigTypes);
    
    setFormValues({
      stockFieldConfigType: initialValues.stockFieldConfigType,
      date: initialValues.date,
      stockCode: initialValues.stockCode,
      fieldQueries: initialValues.fieldQueries || {},
      pageIndex: 1,
      pageSize: 5000
    });
    
    // 同步更新表单值
    form.setFieldsValue({
      stockFieldConfigType: initialValues.stockFieldConfigType,
      date: initialValues.date,
      stockCode: initialValues.stockCode,
      fieldQueries: initialValues.fieldQueries || {},
      pageIndex: 1,
      pageSize: 5000
    });
  }, [initialValues, form, stockFieldConfigTypes]);

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

  // 查询处理函数
  const handleSearch = () => {
    // 获取表单值
    form.validateFields().then(values => {
      const searchValues = {
        stockFieldConfigType: values.stockFieldConfigType,
        date: values.date,
        stockCode: values.stockCode,
        fieldQueries: values.fieldQueries || {},
        pageIndex: values.pageIndex,
        pageSize: values.pageSize
      };
      
      // 调用父组件的搜索函数
      onSearch(searchValues);
      // 关闭弹窗
      onCancel();
    });
  };

  // 重置表单
  const handleReset = () => {
    form.resetFields();
    setFormValues({
      stockFieldConfigType: initialValues.stockFieldConfigType,
      date: initialValues.date,
      stockCode: '',
      fieldQueries: {},
      pageIndex: 1,
      pageSize: 5000
    });
  };

  return (
    <Modal
      title="高级搜索"
      open={visible}
      onCancel={onCancel}
      width={500}
      centered
      destroyOnClose
      maskClosable={true}
      keyboard={true}
      style={{ top: 20 }}
      bodyStyle={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
      footer={[
        <Button key="reset" onClick={handleReset}>
          重置
        </Button>,
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="search" type="primary" onClick={handleSearch}>
          查询
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={formValues}
        size="small"
      >
        <Form.Item
          label="表配置类型"
          name="stockFieldConfigType"
          rules={[{ required: true, message: '请选择表配置类型' }]}
          style={{ marginBottom: '12px' }}
        >
          <Select
            placeholder="请选择表配置类型"
            onChange={(value) => handleInputChange('stockFieldConfigType', value)}
            size="small"
            showSearch
            filterOption={(input, option) =>
              option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            {stockFieldConfigTypes.map((option) => (
              <Select.Option key={option} value={option}>
                {option}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label="日期"
          name="date"
          rules={[{ required: true, message: '请选择日期' }]}
          style={{ marginBottom: '12px' }}
        >
          <Select
            placeholder="请选择日期"
            onChange={(value) => handleInputChange('date', value)}
            size="small"
            showSearch
            filterOption={(input, option) =>
              option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            {dates.map((option) => (
              <Select.Option key={option} value={option}>
                {option}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label="关键字"
          name="stockCode"
          style={{ marginBottom: '12px' }}
        >
          <Input
            placeholder="请输入股票代码，多个代码用逗号分隔"
            onChange={(e) => handleInputChange('stockCode', e.target.value)}
            size="small"
          />
        </Form.Item>

        {Object.entries(formValues.fieldQueries || {}).length > 0 && (
          <>
            <Divider orientation="left" style={{ margin: '12px 0 8px 0' }}>字段查询条件</Divider>
            
            {Object.entries(formValues.fieldQueries || {}).map(([field, query]) => (
              <div key={field} style={{ marginBottom: '8px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px'
                }}>
                  <span style={{ minWidth: '70px', fontWeight: 'bold', fontSize: '12px' }}>
                    {query.fieldName || field}:
                  </span>
                  <Input
                    placeholder="最小值"
                    value={query.start || ''}
                    onChange={(e) => handleFieldQueryChange(field, e.target.value, 'start')}
                    style={{ flex: 1 }}
                    size="small"
                  />
                  <span style={{ fontSize: '12px' }}>至</span>
                  <Input
                    placeholder="最大值"
                    value={query.end || ''}
                    onChange={(e) => handleFieldQueryChange(field, e.target.value, 'end')}
                    style={{ flex: 1 }}
                    size="small"
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </Form>
    </Modal>
  );
});

export default SearchModal;
