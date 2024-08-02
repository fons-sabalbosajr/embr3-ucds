import React from 'react';
import { Layout, Menu, Typography } from 'antd';
import { FolderOpenOutlined} from '@ant-design/icons';
import { Route, Routes, useNavigate } from 'react-router-dom';
import ECC from './items/ECC/ECC';
import PTO from './items/PTO/PTO';
import WWDP from './items/WWDP/WWDP';

const { Sider, Content } = Layout;
const { Title } = Typography;

const ExtractData = () => {
  const navigate = useNavigate();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} className="site-layout-background">
        <Menu
          mode="inline"
          defaultSelectedKeys={['1']}
          style={{ height: '100%', borderRight: 0 }}
        >
          <Menu.Item key="1" icon={<FolderOpenOutlined/>} onClick={() => navigate('ecc')}>
            ECC
          </Menu.Item>
          <Menu.Item key="2" icon={<FolderOpenOutlined />} onClick={() => navigate('pto')}>
            PTO
          </Menu.Item>
          <Menu.Item key="3" icon={<FolderOpenOutlined />} onClick={() => navigate('wwdp')}>
            WWDP
          </Menu.Item>
        </Menu>
      </Sider>
      <Layout style={{ padding: '0 12px 12px' }}>
        <Content
          style={{
            padding: 24,
            margin: 0,
            minHeight: 280,
            backgroundColor: '#fff',
          }}
        >
          <Title level={3}>Extract/Generate Data</Title>
          <Routes>
            <Route path="ecc" element={<ECC />} />
            <Route path="pto" element={<PTO />} />
            <Route path="wwdp" element={<WWDP />} />
            <Route path="/" element={<div>Select an option from the side menu</div>} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default ExtractData;
