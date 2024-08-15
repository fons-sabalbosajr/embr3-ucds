import React, { useState, useEffect, useRef } from 'react';
import { GoogleMap, LoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { Card, Row, Col, Button, Alert, Spin } from 'antd';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const mapContainerStyle = {
  width: '100%',
  height: '550px',
};

const R3Map = ({ latitude, longitude }) => {
  const [isStreetView, setIsStreetView] = useState(false);
  const [center, setCenter] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInfoWindow, setShowInfoWindow] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const mapRef = useRef(null);

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

  const onLoad = map => {
    mapRef.current = map;
    console.log('Map loaded:', map);
  };

  const handleMarkerClick = place => {
    setSelectedPlace(place);
    setShowInfoWindow(true);
  };

  const handleInfoWindowClose = () => {
    setShowInfoWindow(false);
  };

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
          />
        ) : (
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <GoogleMap
                mapTypeId={'satellite'} 
                mapContainerStyle={mapContainerStyle}
                center={center}
                zoom={25} // Adjust zoom level as needed
                onLoad={onLoad}
                options={{
                  disableDefaultUI: true,
                  streetViewControl: true,
                  mapTypeControl: true,
                  fullscreenControl: true,
                  scaleControl: true,
                  zoomControl: true,
                  rotateControl: true
                }}
              >
                {center && (
                  <Marker
                    position={center}
                    onClick={() => handleMarkerClick({ name: 'Marker Name', details: 'Marker Details' })}
                  />
                )}
                {showInfoWindow && selectedPlace && (
                  <InfoWindow
                    position={center}
                    onCloseClick={handleInfoWindowClose}
                  >
                    <div>
                      <h3>{selectedPlace.name}</h3>
                      <p>{selectedPlace.details}</p>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            </Col>
          </Row>
        )}
      </Card>
    </LoadScript>
  );
};

export default R3Map;
