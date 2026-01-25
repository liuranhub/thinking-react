import React, { useState, useEffect } from 'react';
import { Table, Input, Button, Modal, Form, Select, DatePicker, message, Space, Popconfirm, Pagination, Switch } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { API_HOST } from '../config/config';
import { get, post, put, del as deleteMethod } from '../utils/httpClient';
import './WatchConfigManagement.css';

const { Option } = Select;

const WatchConfigManagement = () => {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [searchText, setSearchText] = useState(searchParams.get('stockCode') || '');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();
  const [stockList, setStockList] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [watchModelOptions, setWatchModelOptions] = useState([]);

  // 获取监控模式选项
  const fetchWatchModelOptions = async () => {
    try {
      const result = await get(`${API_HOST}/stock/watch/getWatchModelMap`);
      if (result && typeof result === 'object') {
        // 将对象转换为数组格式
        const options = Object.entries(result).map(([key, value]) => ({
          value: key,
          label: value
        }));
        setWatchModelOptions(options);
      } else {
        setWatchModelOptions([]);
      }
    } catch (error) {
      console.error('获取监控模式选项失败:', error);
      setWatchModelOptions([]);
    }
  };

  // 获取股票列表
  const fetchStockList = async (searchText = '') => {
    setStockLoading(true);
    try {
      const result = await get(`${API_HOST}/stock/stockListSimple`);
      if (Array.isArray(result)) {
        setStockList(result);
      } else {
        setStockList([]);
      }
    } catch (error) {
      console.error('获取股票列表失败:', error);
      setStockList([]);
    } finally {
      setStockLoading(false);
    }
  };

  // 获取监控配置列表
  const fetchWatchConfigList = async (pageIndex = 1, pageSize = 10, stockCode = '') => {
    setLoading(true);
    try {
      const result = await post(`${API_HOST}/stock/watch/getWatchConfigList`, {
        pageIndex,
        pageSize,
        stockCode: stockCode || undefined,
      });
      console.log('API返回数据:', result); // 调试日志
      
      // 根据实际返回数据结构处理
      if (result.records && Array.isArray(result.records)) {
        setData(result.records);
        setPagination(prevPagination => ({
          ...prevPagination,
          current: pageIndex,
          pageSize: pageSize,
          total: result.total || 0,
        }));
      } else {
        message.error('数据格式错误');
      }
    } catch (error) {
      console.error('获取监控配置列表失败:', error);
      message.error('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 创建或更新监控配置
  const createOrUpdateWatchConfig = async (values) => {
    try {
      const result = await post(`${API_HOST}/stock/watch/createOrUpdateWatchConfig`, {
        stockCode: values.stockCode,
        watchModel: values.watchModel,
        targetPrice: values.targetPrice,
        startDate: values.startDate.format('YYYY-MM-DD'),
        ...(editingRecord && { id: editingRecord.id }),
      });

      if (result) {
        message.success(editingRecord ? '更新成功' : '创建成功');
        setIsModalVisible(false);
        form.resetFields();
        setEditingRecord(null);
        fetchWatchConfigList(pagination.current, pagination.pageSize, searchText);
      } else {
        message.error('操作失败');
      }
    } catch (error) {
      console.error('创建或更新监控配置失败:', error);
      message.error('网络错误，请稍后重试');
    }
  };

  // 更新监控配置状态
  const updateWatchConfigStatus = async (id, status) => {
    try {
      await put(`${API_HOST}/stock/watch/updateStatus/${id}/${status}`);
      message.success(status === 'ENABLE' ? '启用成功' : '禁用成功');
      fetchWatchConfigList(pagination.current, pagination.pageSize, searchText);
    } catch (error) {
      console.error('更新监控配置状态失败:', error);
      message.error('网络错误，请稍后重试');
    }
  };

  // 删除监控配置
  const deleteWatchConfig = async (id) => {
    try {
      await deleteMethod(`${API_HOST}/stock/watch/deleteWatchConfig/${id}`);
      message.success('删除成功');
      fetchWatchConfigList(pagination.current, pagination.pageSize, searchText);
    } catch (error) {
      console.error('删除监控配置失败:', error);
      message.error('网络错误，请稍后重试');
    }
  };

  // 处理搜索
  const handleSearch = () => {
    fetchWatchConfigList(1, pagination.pageSize, searchText);
  };

  // 处理分页变化
  const handleTableChange = (paginationInfo) => {
    fetchWatchConfigList(paginationInfo.current, paginationInfo.pageSize, searchText);
  };

  // 打开创建/编辑模态框
  const showModal = (record = null) => {
    setEditingRecord(record);
    if (record) {
      form.setFieldsValue({
        ...record,
        startDate: record.startDate ? dayjs(record.startDate) : null,
      });
    } else {
      form.resetFields();
      // 设置默认日期为当前日期
      form.setFieldsValue({
        startDate: dayjs(),
      });
    }
    setIsModalVisible(true);
    // 获取股票列表
    fetchStockList();
  };

  // 表格列定义
  const columns = [
    {
      title: '股票代码',
      dataIndex: 'stockCode',
      key: 'stockCode',
      render: (text) => (
        <span style={{ color: '#1890ff', cursor: 'pointer' }}>{text}</span>
      ),
    },
    {
      title: '监控模式',
      dataIndex: 'watchModel',
      key: 'watchModel',
      render: (text) => {
        const option = watchModelOptions.find(opt => opt.value === text);
        return option ? option.label : text;
      },
    },
    {
      title: '目标价格',
      dataIndex: 'targetPrice',
      key: 'targetPrice',
      render: (text) => text || '-',
    },
    {
      title: '匹配成功次数',
      dataIndex: 'matchTimes',
      key: 'matchTimes',
      render: (text) => text || 0,
    },
    {
      title: '开始日期',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (text) => text || '-',
    },
    {
      title: '启用/禁用',
      key: 'enableDisable',
      render: (_, record) => (
        <Switch
          checked={record.status === 'ENABLE'}
          onChange={(checked) => {
            const newStatus = checked ? 'ENABLE' : 'DISABLE';
            updateWatchConfigStatus(record.id, newStatus);
          }}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => showModal(record)}
            title="编辑"
          />
          <Popconfirm
            title="确定要删除这个监控配置吗？"
            onConfirm={() => deleteWatchConfig(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              icon={<DeleteOutlined />}
              title="删除"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];



  // 初始化数据
  useEffect(() => {
    // 获取监控模式选项
    fetchWatchModelOptions();
    
    // 如果有URL参数中的stockCode，自动搜索
    const stockCodeFromUrl = searchParams.get('stockCode');
    if (stockCodeFromUrl) {
      fetchWatchConfigList(1, 10, stockCodeFromUrl);
    } else {
      fetchWatchConfigList();
    }
  }, [searchParams]);

  return (
    <div className="watch-config-management">
      {/* 头部和搜索 */}
      <div className="page-header">
        <h1 className="page-title">监控配置管理</h1>
        <div className="header-actions">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showModal()}
          >
            添加
          </Button>
          <Input
            placeholder="搜索股票代码"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            prefix={<SearchOutlined />}
            style={{ width: 300, marginLeft: 16 }}
          />
          <Button type="primary" onClick={handleSearch} style={{ marginLeft: 8 }}>
            搜索
          </Button>
        </div>
      </div>

      {/* 表格 */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={false}
        className="watch-config-table"
      />

      {/* 分页器 */}
      <div className="pagination-container">
        <Pagination
          current={pagination.current}
          pageSize={pagination.pageSize}
          total={pagination.total}
          showSizeChanger={true}
          showQuickJumper={true}
          showTotal={(total) => `共 ${total} 条记录`}
          pageSizeOptions={['10', '20', '50', '100']}
          onChange={(page, pageSize) => {
            fetchWatchConfigList(page, pageSize, searchText);
          }}
        />
      </div>

      {/* 创建/编辑模态框 */}
      <Modal
        title={editingRecord ? '编辑监控配置' : '添加监控配置'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          setEditingRecord(null);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={createOrUpdateWatchConfig}
        >
          <Form.Item
            name="stockCode"
            label="股票选择"
            rules={[{ required: true, message: '请选择股票' }]}
          >
            <Select
              placeholder="请选择股票"
              loading={stockLoading}
              showSearch
              filterOption={(input, option) => {
                const children = String(option?.children || '');
                const value = String(option?.value || '');
                const inputLower = input.toLowerCase();
                return children.toLowerCase().includes(inputLower) || 
                       value.toLowerCase().includes(inputLower);
              }}
            >
              {stockList.map(stock => (
                <Option key={stock.stockCode} value={stock.stockCode}>
                  {stock.stockCode} - {stock.stockName}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="watchModel"
            label="监控模式"
            rules={[
              { required: true, message: '请选择监控模式' },
              {
                validator: (_, value) => {
                  if (value && !watchModelOptions.find(option => option.value === value)) {
                    return Promise.reject(new Error('请选择有效的监控模式'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Select placeholder="请选择监控模式">
              {watchModelOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="targetPrice"
            label="目标价格"
            rules={[
              { required: true, message: '请输入目标价格' },
              {
                validator: (_, value) => {
                  if (value && parseFloat(value) <= 0) {
                    return Promise.reject(new Error('目标价格必须大于0'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Input placeholder="请输入目标价格" />
          </Form.Item>

          <Form.Item
            name="startDate"
            label="开始日期"
            rules={[
              { required: true, message: '请选择开始日期' },
              {
                validator: (_, value) => {
                  if (value && value.isBefore(dayjs(), 'day')) {
                    return Promise.reject(new Error('开始日期不能早于今天'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <DatePicker 
              style={{ width: '100%' }} 
              disabledDate={(current) => {
                // 禁用今天之前的日期
                return current && current < dayjs().startOf('day');
              }}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit"
                onClick={() => {
                  // 手动触发表单验证
                  form.validateFields()
                    .then(() => {
                      // 验证通过，表单会自动调用 onFinish
                    })
                    .catch((errorInfo) => {
                      console.log('表单验证失败:', errorInfo);
                    });
                }}
              >
                {editingRecord ? '更新' : '创建'}
              </Button>
              <Button onClick={() => {
                setIsModalVisible(false);
                setEditingRecord(null);
                form.resetFields();
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WatchConfigManagement;
