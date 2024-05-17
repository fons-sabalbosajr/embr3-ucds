import React, { useState, useEffect } from 'react';
import { GoogleMap, LoadScript, StreetViewPanorama } from '@react-google-maps/api';
import { Card, Row, Col, Button, Alert, Spin } from 'antd';

const GOOGLE_MAPS_API_KEY = "AIzaSyBQSWuvJx6N7wQ2adHqBEdNyurA3G9-ogc";

const mapContainerStyle = {
  width: '100%',
  height: '550px',
};

const R3Map = ({ latitude, longitude }) => {
  const [isStreetView, setIsStreetView] = useState(false);
  const [center, setCenter] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleRefresh = () => {
    setError(null);
    setLoading(true);
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      setCenter({ lat, lng });
      setLoading(false);
    } else {
      setError("Please check your coordinates encoded. Close this window and try again.");
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRefresh();
  }, [latitude, longitude]);

  return (
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Industry Map</span>
            <Button type='primary' onClick={handleRefresh}>Refresh</Button>
          </div>
        }
      >
        {loading ? (
          <Spin tip="Loading Map..." size="large">
            <div style={{ width: '100%', height: '550px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}></div>
          </Spin>
        ) : error ? (
          <Alert
            type="error"
            message="No/Invalid Coordinates encoded"
            description={error}
            // action={
            //   <Button size="small" type="primary" onClick={handleRefresh}>
            //     Refresh
            //   </Button>
            // }
          />
        ) : (
          <Row gutter={[16, 16]}>
            {center && (
              <Col span={24}>
                {isStreetView ? (
                  <StreetViewPanorama
                    position={center}
                    pov={{ heading: 0, pitch: 0 }}
                    visible
                    mapContainerStyle={mapContainerStyle}
                  />
                ) : (
                  <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={center}
                    zoom={25}
                    mapTypeId={'satellite'} // Set map to satellite mode
                  />
                )}
              </Col>
            )}
          </Row>
        )}
      </Card>
    </LoadScript>
  );
};


export default R3Map;
