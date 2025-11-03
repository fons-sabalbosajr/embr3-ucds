import React, { useState, useEffect, useRef } from "react";
import {
  GoogleMap,
  LoadScript,
  Marker,
  InfoWindow,
  Circle,
} from "@react-google-maps/api";
import { Card, Row, Col, Button, Alert, Spin } from "antd";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const mapContainerStyle = {
  width: "100%",
  height: "550px",
};

const R3Map = ({
  latitude,
  longitude,
  showLegend = true,
  legendLabel = "Establishment Location",
}) => {
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
      setError(
        "Please check your coordinates encoded. Close this window and try again."
      );
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRefresh();
  }, [latitude, longitude]);

  const onLoad = (map) => {
    mapRef.current = map;
    //console.log("Map loaded:", map);
  };

  const handleMarkerClick = (place) => {
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Industry Map</span>
            <Button type="primary" onClick={handleRefresh}>
              Refresh
            </Button>
          </div>
        }
      >
        {loading ? (
          <Spin tip="Loading Map..." size="large">
            <div
              style={{
                width: "100%",
                height: "550px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            ></div>
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
              <div style={{ position: "relative" }}>
                <GoogleMap
                  mapTypeId={"satellite"}
                  mapContainerStyle={mapContainerStyle}
                  center={center}
                  zoom={19} // Reduced a bit so the marker is easier to notice
                  onLoad={onLoad}
                  options={{
                    disableDefaultUI: true,
                    streetViewControl: true,
                    mapTypeControl: true,
                    fullscreenControl: true,
                    scaleControl: true,
                    zoomControl: true,
                    rotateControl: true,
                  }}
                >
                  {center && (
                    <>
                      {/* Highlight circle to make the point obvious */}
                      <Circle
                        center={center}
                        radius={30}
                        options={{
                          strokeColor: "#d84a4a",
                          strokeOpacity: 0.9,
                          strokeWeight: 2,
                          fillColor: "#d84a4a",
                          fillOpacity: 0.25,
                          clickable: false,
                        }}
                      />
                      <Marker
                        position={center}
                        label={{
                          text: "•",
                          color: "#b40000",
                          fontSize: "22px",
                        }}
                        onClick={() =>
                          handleMarkerClick({
                            name: "Establishment",
                            details: `${center.lat.toFixed(
                              6
                            )}, ${center.lng.toFixed(6)}`,
                          })
                        }
                      />
                    </>
                  )}
                  {showInfoWindow && selectedPlace && (
                    <InfoWindow
                      position={center}
                      onCloseClick={handleInfoWindowClose}
                    >
                      <div>
                        <h3 style={{ margin: 0 }}>{selectedPlace.name}</h3>
                        <p style={{ margin: 0 }}>{selectedPlace.details}</p>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>

                {showLegend && (
                  <div
                    style={{
                      position: "absolute",
                      left: 12,
                      bottom: 12,
                      background: "rgba(255, 255, 255, 0.92)",
                      border: "1px solid rgba(0,0,0,0.15)",
                      borderRadius: 6,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                      padding: "8px 10px",
                      zIndex: 2,
                      minWidth: 180,
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      Legend
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        aria-hidden
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "#d84a4a",
                          border: "1px solid #b23b3b",
                        }}
                      />
                      <span>{legendLabel}</span>
                    </div>
                    {center && (
                      <div style={{ marginTop: 6, color: "#444" }}>
                        <div>Lat: {center.lat.toFixed(6)}</div>
                        <div>Lng: {center.lng.toFixed(6)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Col>
          </Row>
        )}
      </Card>
    </LoadScript>
  );
};

export default R3Map;
