import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarkerItem {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  type?: 'DEPOT' | 'STOP' | 'BIN' | 'REPORT' | 'PIN' | 'VEHICLE';
  badgeNumber?: number;
}

interface MapProps {
  markers?: MapMarkerItem[];
  polyline?: [number, number][];
  onLocationSelect?: (lat: number, lng: number) => void;
  center?: [number, number];
  zoom?: number;
  height?: string;
}

export const MapComponent: React.FC<MapProps> = ({
  markers = [],
  polyline = [],
  onLocationSelect,
  center = [19.077, 72.999],
  zoom = 14,
  height = '420px'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      if (onLocationSelect) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          onLocationSelect(e.latlng.lat, e.latlng.lng);
        });
      }

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update layers when markers or polyline change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const bounds = L.latLngBounds([]);

    // Add Markers
    markers.forEach((m) => {
      const latLng = L.latLng(m.lat, m.lng);
      bounds.extend(latLng);

      let iconHtml = '';
      if (m.type === 'VEHICLE') {
        iconHtml = `<div style="background:#2563eb; color:#fff; border:2px solid #ffffff; border-radius:50%; width:38px; height:38px; display:flex; align-items:center; justify-content:center; font-size:17px; box-shadow:0 0 0 5px rgba(37,99,235,0.3), 0 4px 10px rgba(0,0,0,0.35);">🚛</div>`;
      } else if (m.type === 'DEPOT') {
        iconHtml = `<div style="background:#081c15; color:#fff; border:2px solid #fff; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; box-shadow:0 2px 6px rgba(0,0,0,0.3);">MRF</div>`;
      } else if (m.badgeNumber) {
        iconHtml = `<div style="background:#1b4332; color:#fff; border:2px solid #fff; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; box-shadow:0 2px 6px rgba(0,0,0,0.3);">${m.badgeNumber}</div>`;
      } else if (m.type === 'PIN') {
        iconHtml = `<div style="background:#dc2626; color:#fff; border:2px solid #fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; box-shadow:0 2px 6px rgba(0,0,0,0.4);">📍</div>`;
      } else {
        iconHtml = `<div style="background:#2d6a4f; color:#fff; border:2px solid #fff; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.25);">●</div>`;
      }

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-map-marker',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20]
      });

      const marker = L.marker(latLng, { icon: customIcon });
      marker.bindPopup(`
        <div style="font-family:sans-serif; min-width:140px;">
          <strong style="color:#081c15; font-size:13px;">${m.title}</strong>
          ${m.subtitle ? `<p style="color:#4e6357; font-size:11px; margin-top:3px;">${m.subtitle}</p>` : ''}
          ${m.badgeNumber ? `<span style="display:inline-block; margin-top:5px; background:#eef9f2; color:#1b4332; font-size:10px; font-weight:600; padding:2px 6px; border-radius:4px;">Stop #${m.badgeNumber}</span>` : ''}
        </div>
      `);
      layerGroup.addLayer(marker);
    });

    // Add Polyline
    if (polyline && polyline.length > 1) {
      const latLngs = polyline.map(p => L.latLng(p[0], p[1]));
      latLngs.forEach(ll => bounds.extend(ll));

      const line = L.polyline(latLngs, {
        color: '#2d6a4f',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
      });
      layerGroup.addLayer(line);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [markers, polyline]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
};
